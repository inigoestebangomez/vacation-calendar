sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/ui/core/UIComponent",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast"
], function (Controller, History, UIComponent, JSONModel, MessageToast) {
    "use strict";
    
    return Controller.extend(
        "vacation.caledar.vacationcalendar.controller.Admin",
        {
          onInit: function () {
            let oRouter = sap.ui.core.UIComponent.getRouterFor(this);
            oRouter
              .getRoute("admin")
              .attachPatternMatched(this._onRouteMatched, this);
      
            this.onLoadEmployeeData();
            this.onFetchDepartments();
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
            console.log("Response from server:", response);
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
                      btn.isA("sap.m.Button") && btn.getText() === "Close"
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

          const oAdminText = oVBox.getItems().find((c) => c.getId().includes("adminText"));
          const oAdminEdit = oVBox.getItems().find((c) => c.getId().includes("adminEdit"));
          const oDepartmentsText = oVBox.getItems().find((c) => c instanceof sap.m.Text && c.getText().startsWith("Departments:"));
          const oDepartmentsEdit = oVBox.getItems().find((c) => c.getId().includes("departmentsEdit"));

          const bIsEdit = oAdminEdit.getVisible(); 
          const oCtx = oPanel.getBindingContext("vacationModel");
          const oData = oCtx.getObject();
          const oModel = this.getView().getModel("vacationModel");

          if (!bIsEdit) {
              // Entrar en modo edición
              oAdminText.setVisible(false);
              oDepartmentsText.setVisible(false);
              oAdminEdit.setVisible(true);
              oDepartmentsEdit.setVisible(true);
              oButton.setText("Save");

              // Convertir nombres actuales a IDs
              const aAllDepartments = oModel.getProperty("/allDepartments") || [];
              const selectedIds = (oData.departments || []).map(depName => {
                  const match = aAllDepartments.find(d => d.department === depName);
                  return match ? match.id.toString() : null; // Convertir a string
              }).filter(id => id !== null);

              // Establecer las keys seleccionadas en el MultiComboBox
              oModel.setProperty(oCtx.getPath() + "/selectedDepartmentIds", selectedIds);
              
              // También puedes establecer directamente en el control si es necesario
              oDepartmentsEdit.setSelectedKeys(selectedIds);
              
          } else {
              // Guardar cambios
              const bAdmin = oAdminEdit.getSelected() ? 1 : 0;
              const selectedIds = oDepartmentsEdit.getSelectedKeys(); // Array de IDs como strings

              const aAllDepartments = oModel.getProperty("/allDepartments") || [];
              const selectedNames = selectedIds.map(id => {
                  const match = aAllDepartments.find(d => d.id.toString() === id);
                  return match ? match.department : null;
              }).filter(name => name !== null);

              oData.admin = bAdmin;
              oData.departments = selectedNames;

              fetch(`http://localhost:3000/employees/${oData.id}`, {
                  method: "PUT",
                  headers: {
                      "Content-Type": "application/json"
                  },
                  body: JSON.stringify(oData)
              })
              .then(response => {
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
              })
              .catch(error => {
                  console.error("Error al guardar:", error);
                  MessageToast.show("Error al guardar cambios");
              });
          }
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
              selectedDepartmentIds: []
            });
          }
        },

        _refreshEmployeeList: function () {
          const oModel = this.getView().getModel("vacationModel");
          if (oModel) {
            oModel.refresh(true);
          }
        },

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

          oNewEmployee.name = `${oNewEmployee.firstName} ${oNewEmployee.lastName || ""}`.trim();

          if (!oNewEmployee.name || !oNewEmployee.email) {
            MessageToast.show("Name and Email are required");
            return;
          }

          oNewEmployee.admin = oNewEmployee.admin ? 1 : 0;

          oModel.getProperty("/allDepartments") || [];
          
          delete oNewEmployee.firstName;
          delete oNewEmployee.lastName;

         try {
            const response = await fetch("http://localhost:3000/employees", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify(oNewEmployee)
            });

            if (!response.ok) {
              throw new Error(`Error creating employee: ${response.status}`);
            }

            const newEmployee = await response.json();
            console.log("New employee created:", newEmployee);

            this._refreshEmployeeList();
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