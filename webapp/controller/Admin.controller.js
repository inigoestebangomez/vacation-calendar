sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/ui/core/UIComponent",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, History, UIComponent, JSONModel, MessageToast, MessageBox) {
    "use strict";
    
    return Controller.extend(
      "vacation.caledar.vacationcalendar.controller.Admin",
      {
        onInit: function () {
            let oRouter = sap.ui.core.UIComponent.getRouterFor(this);
            oRouter
                .getRoute("admin")
                .attachPatternMatched(this._onRouteMatched, this);

            // Verificar permisos de administrador antes de cargar datos
            this.checkAdminPermissions()
                .then((hasPermission) => {
                    if (hasPermission) {
                        this.onLoadEmployeeData();
                        this.onFetchDepartments();
                    } else {
                        // Redirigir de vuelta al calendario si no tiene permisos
                        MessageToast.show("Access denied: Administrator permissions required");
                        this.onNavBack();
                    }
                })
                .catch((error) => {
                    console.error("Error checking permissions:", error);
                    MessageToast.show("Error verifying permissions");
                    this.onNavBack();
                });
        },

        checkAdminPermissions: async function() {
            try {
                // Primero obtener el token
                const token = sessionStorage.getItem("access_token");
                if (!token) {
                    throw new Error("No authentication token found");
                }

                // Obtener información del usuario actual
                const userResponse = await fetch("http://localhost:3000/user/profile", {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!userResponse.ok) {
                    throw new Error("Failed to get user information");
                }

                const userData = await userResponse.json();
                const userEmail = userData.userPrincipalName || userData.mail;

                if (!userEmail) {
                    throw new Error("User email not found");
                }

                // Verificar si es administrador
                const adminResponse = await fetch(`http://localhost:3000/api/isAdmin?email=${encodeURIComponent(userEmail)}`);
                
                if (!adminResponse.ok) {
                    throw new Error("Failed to check admin status");
                }

                const adminData = await adminResponse.json();
                return adminData.isAdmin;

            } catch (error) {
                console.error("Error checking admin permissions:", error);
                return false;
            }
        },

        _onRouteMatched: function() {
            // Verificar permisos cada vez que se accede a la vista
            this.checkAdminPermissions()
                .then((hasPermission) => {
                    if (!hasPermission) {
                        MessageToast.show("Access denied: Administrator permissions required");
                        this.onNavBack();
                    }
                });
        },

        getRouter: function () {
          return UIComponent.getRouterFor(this);
        },

        onLoadEmployeeData: async function () {
          const oView = this.getView();
          let oModel = oView.getModel("vacationModel");
          if (!oModel) {
            oModel = new JSONModel({ employees: [] });
            oView.setModel(oModel, "vacationModel");
          }

          try {
            const response = await fetch("http://localhost:3000/employees");
            if (!response.ok)
              throw new Error`Error fetching employees: ${response.status}`();
            const data = await response.json();
            console.log("Data fetched from server:", data);

            oModel.setProperty("/employees", data);
          } catch (error) {
            console.error("Error fetching employees:", error);
            MessageToast.show("No se pudieron cargar los empleados");
          }
        },

        onEmployeeItemPress: function (oEvt) {
          const oItem = oEvt.getSource();
          const aContent = oItem.getContent();

          const oPanel = aContent.find((control) => control.isA("sap.m.Panel"));

          if (oPanel) {
            const bVisible = oPanel.getVisible();
            oPanel.setVisible(!bVisible);
            oPanel.setExpanded(!bVisible);

            if (!bVisible) {
              const oVBox = oPanel.getContent()[0];
              const oFlexBox = oVBox
                .getItems()
                .find((control) => control.isA("sap.m.FlexBox"));

              if (oFlexBox) {
                const oCloseBtn = oFlexBox
                  .getItems()
                  .find(
                    (btn) =>
                      btn.isA("sap.m.Button") &&
                      btn.getId().includes("closeBtn")
                  );

                if (oCloseBtn) {
                  oCloseBtn.attachPress(() => {
                    oPanel.setVisible(false);
                    oPanel.setExpanded(false);
                  });
                }
              }
            }
          }
        },

        onEditEmployee: function (oEvent) {
          const oButton = oEvent.getSource();
          const oFlexBox = oButton.getParent();
          const oVBox = oFlexBox.getParent();
          const oPanel = oVBox.getParent();

          const oAdminText = oVBox
            .getItems()
            .find((c) => c.getId().includes("adminText"));
          const oAdminEdit = oVBox
            .getItems()
            .find((c) => c.getId().includes("adminEdit"));
          const oDepartmentsText = oVBox
            .getItems()
            .find(
              (c) =>
                c instanceof sap.m.Text &&
                c.getText().startsWith("Departments:")
            );
          const oDepartmentsEdit = oVBox
            .getItems()
            .find((c) => c.getId().includes("departmentsEdit"));
          const oCancelBtn = oFlexBox
            .getItems()
            .find((c) => c.getId().includes("cancelBtn"));
          const oCloseBtn = oFlexBox
            .getItems()
            .find((c) => c.getId().includes("closeBtn"));

          const bIsEdit = oAdminEdit.getVisible();
          const oCtx = oPanel.getBindingContext("vacationModel");
          const oData = oCtx.getObject();
          const oModel = this.getView().getModel("vacationModel");

          if (!bIsEdit) {
            // Guardar copia de los datos originales para cancelar
            oModel.setProperty(oCtx.getPath() + "/_original", {
              admin: oData.admin,
              departments: Array.isArray(oData.departments)
                ? [...oData.departments]
                : [],
            });

            oAdminText.setVisible(false);
            oDepartmentsText.setVisible(false);
            oAdminEdit.setVisible(true);
            oDepartmentsEdit.setVisible(true);
            oButton.setText("Save");
            if (oCancelBtn) oCancelBtn.setVisible(true);
            if (oCloseBtn) oCloseBtn.setVisible(false);

            // Convertir nombres actuales a IDs
            const aAllDepartments = oModel.getProperty("/allDepartments") || [];
            const selectedIds = (oData.departments || [])
              .map((depName) => {
                const match = aAllDepartments.find(
                  (d) => d.department === depName
                );
                return match ? match.id.toString() : null;
              })
              .filter((id) => id !== null);

            oModel.setProperty(
              oCtx.getPath() + "/selectedDepartmentIds",
              selectedIds
            );
            oDepartmentsEdit.setSelectedKeys(selectedIds);
          } else {
            const bAdmin = oAdminEdit.getSelected() ? 1 : 0;
            const selectedIds = oDepartmentsEdit.getSelectedKeys();

            const aAllDepartments = oModel.getProperty("/allDepartments") || [];
            const selectedNames = selectedIds
              .map((id) => {
                const match = aAllDepartments.find(
                  (d) => d.id.toString() === id
                );
                return match ? match.department : null;
              })
              .filter((name) => name !== null);

            oData.admin = bAdmin;
            oData.departments = selectedNames;

            fetch(`http://localhost:3000/employees/${oData.id}`, {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(oData),
            })
              .then((response) => {
                if (!response.ok) {
                  throw new Error("Error en la respuesta del servidor");
                }
                return response.json();
              })
              .then(() => {
                MessageToast.show("Cambios guardados");

                oModel.updateBindings();

                // Salir de edición
                oAdminText.setVisible(true);
                oDepartmentsText.setVisible(true);
                oAdminEdit.setVisible(false);
                oDepartmentsEdit.setVisible(false);
                oButton.setText("Edit");
                if (oCancelBtn) oCancelBtn.setVisible(false);
                if (oCloseBtn) oCloseBtn.setVisible(true);
              })
              .catch((error) => {
                console.error("Error al guardar:", error);
                MessageToast.show("Error al guardar cambios");
              });
          }
        },

        onCancelEdit: function (oEvent) {
          const oButton = oEvent.getSource();
          const oFlexBox = oButton.getParent();
          const oVBox = oFlexBox.getParent();
          const oPanel = oVBox.getParent();

          const oAdminText = oVBox
            .getItems()
            .find((c) => c.getId().includes("adminText"));
          const oAdminEdit = oVBox
            .getItems()
            .find((c) => c.getId().includes("adminEdit"));
          const oDepartmentsText = oVBox
            .getItems()
            .find(
              (c) =>
                c instanceof sap.m.Text &&
                c.getText().startsWith("Departments:")
            );
          const oDepartmentsEdit = oVBox
            .getItems()
            .find((c) => c.getId().includes("departmentsEdit"));
          const oEditBtn = oFlexBox
            .getItems()
            .find((c) => c.getId().includes("editBtn"));
          const oCancelBtn = oFlexBox
            .getItems()
            .find((c) => c.getId().includes("cancelBtn"));
          const oCloseBtn = oFlexBox
            .getItems()
            .find((c) => c.getId().includes("closeBtn"));

          const oCtx = oPanel.getBindingContext("vacationModel");
          const oModel = this.getView().getModel("vacationModel");
          const oOriginal = oModel.getProperty(oCtx.getPath() + "/_original");

          if (oOriginal) {
            // Restaurar los valores originales
            oModel.setProperty(oCtx.getPath() + "/admin", oOriginal.admin);
            oModel.setProperty(
              oCtx.getPath() + "/departments",
              oOriginal.departments
            );
            oModel.setProperty(oCtx.getPath() + "/selectedDepartmentIds", []);
            oModel.setProperty(oCtx.getPath() + "/_original", undefined);
          }

          oAdminText.setVisible(true);
          oDepartmentsText.setVisible(true);
          oAdminEdit.setVisible(false);
          oDepartmentsEdit.setVisible(false);
          if (oEditBtn) oEditBtn.setText("Edit");
          if (oCancelBtn) oCancelBtn.setVisible(false);
          if (oCloseBtn) oCloseBtn.setVisible(true); // MOSTRAR CLOSE
        },

        onFetchDepartments: async function () {
          try {
            const response = await fetch("http://localhost:3000/departments");
            if (!response.ok) {
              throw new Error(`Error fetching departments: ${response.status}`);
            }
            const aDepartments = await response.json();

            const oModel = this.getView().getModel("vacationModel");
            if (!oModel) {
              console.warn("vacationModel no está listo");
              return;
            }

            const oData = oModel.getData() || {};
            oData.allDepartments = aDepartments;
            oModel.setData(oData);
          } catch (error) {
            console.error("Error cargando departamentos:", error);
            sap.m.MessageToast.show("Error al cargar departamentos");
          }
        },

        onAddEmployee: function () {
          this._clearDialogFields();
          this.onFetchDepartments();
          this.byId("createEmployeeDialog").open();
        },

        _clearDialogFields: function () {
          const oModel = this.getView().getModel("vacationModel");
          if (oModel) {
            oModel.setProperty("/newEmployee", {
              name: "",
              surname: "",
              email: "",
              admin: false,
              departments: [],
              selectedDepartmentIds: [],
            });
          }
        },

        // _refreshEmployeeList: function () {
        //   const oModel = this.getView().getModel("vacationModel");
        //   if (oModel) {
        //     oModel.refresh(true);
        //   }
        // },

        onNameChange: function (oEvent) {
          const oInput = oEvent.getSource();
          const sValue = oInput.getValue();
          const oModel = this.getView().getModel("vacationModel");

          if (!oModel) {
            console.warn("vacationModel no está listo");
            return;
          }

          const sFirstName = this.byId("firstNameInput").getValue().trim();
          const sLastName = this.byId("lastNameInput").getValue().trim();

          const sFullName = `${sFirstName} ${sLastName}`.trim();
          oModel.setProperty("/newEmployee/name", sFullName);
          this.byId("fullNamePreview").setText(sFullName);
        },

        onCreateEmployee: async function () {
          const oModel = this.getView().getModel("vacationModel");
          const oNewEmployee = oModel.getProperty("/newEmployee");

          console.log("Full newEmployee object:", oNewEmployee);

          oNewEmployee.name = `${oNewEmployee.firstName} ${
            oNewEmployee.lastName || ""
          }`.trim();

          if (!oNewEmployee.name || !oNewEmployee.email) {
            MessageToast.show("Name and Email are required");
            return;
          }

          const selectedDepartments = oNewEmployee.departments || [];

          const employeeData = {
            email: oNewEmployee.email,
            name: oNewEmployee.name,
            admin: oNewEmployee.admin ? 1 : 0,
            departments: selectedDepartments,
          };

          console.log(
            "Data being sent to server:",
            JSON.stringify(employeeData, null, 2)
          );

          try {
            const response = await fetch("http://localhost:3000/employees", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(employeeData),
            });

            if (!response.ok) {
              throw new Error(`Error creating employee: ${response.status}`);
            }

            const result = await response.json();
            console.log("New employee created:", result);

            this.onLoadEmployeeData();
            this.onCancelCreateEmployee();
            MessageToast.show("Employee created successfully");
          } catch (error) {
            console.error("Error creating employee:", error);
            MessageToast.show("Error creating employee");
          }
        },

        onCancelCreateEmployee: function () {
          this.byId("createEmployeeDialog").close();
          this._clearDialogFields();
        },

        onDeleteEmployee: async function (oEvent) {
          const oButton = oEvent.getSource();
          const oPanel = oButton.getParent().getParent();
          const oCtx = oPanel.getBindingContext("vacationModel");
          const oData = oCtx.getObject();

          if (!oData || !oData.id) {
            MessageToast.show("No employee selected");
            return;
          }

          const sEmployeeName = oData.name || oData.email || `ID ${oData.id}`;

          MessageBox.confirm(
            `Are you sure you want to delete the employee ${sEmployeeName}?`,
            {
              title: "Confirm Delete",
              onClose: async (oAction) => {
                if (oAction === MessageBox.Action.OK) {
                  try {
                    const response = await fetch(
                      `http://localhost:3000/employees/${oData.id}`,
                      {
                        method: "DELETE",
                      }
                    );

                    if (!response.ok) {
                      throw new Error(
                        `Error deleting employee: ${response.status}`
                      );
                    }

                    this.onLoadEmployeeData();
                    MessageToast.show("Employee deleted successfully");
                  } catch (error) {
                    console.error("Error deleting employee:", error);
                    MessageToast.show("Error deleting employee");
                  }
                }
              },
            }
          );
        },

        // isCurrentUserAdmin: async function () {
        //     const oModel = this.getView().getModel("vacationModel");
        //     const email = oModel.getProperty("/currentUser/email");
        //     if (!email) return false;
        //     try {
        //         const response = await fetch(`http://localhost:3000/api/isAdmin?email=${encodeURIComponent(email)}`);
        //         if (!response.ok) return false;
        //         const data = await response.json();
        //         return !!data.isAdmin;
        //     } catch (e) {
        //         return false;
        //     }
        // }, 

        onNavBack: function () {
          let oHistory = History.getInstance();
          let sPreviousHash = oHistory.getPreviousHash();

          if (sPreviousHash !== undefined) {
            window.history.go(-1);
          } else {
            this.getRouter().navTo("RouteCalendar", {}, true);
          }
        },
      }
    );
})