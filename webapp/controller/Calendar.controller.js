// @ts-nocheck
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/ui/core/dnd/DragInfo",
    "sap/ui/core/dnd/DropInfo",
    "sap/ui/core/CustomData",
    "sap/ui/layout/library",
    "sap/ui/core/Fragment",
    "sap/ui/unified/CalendarDayType",
    "sap/m/Dialog",
    "sap/m/VBox",
    "sap/m/Label",
    "sap/m/Button"
], function (
    Controller, 
    JSONModel, 
    MessageToast, 
    DragInfo, 
    DropInfo, 
    CustomData, 
    layoutLibrary, 
    Fragment, 
    CalendarDayType, 
    Dialog, 
    VBox, 
    Label, 
    Button) {
    "use strict";

    // Función para generar un code_verifier (cadena aleatoria segura)
    function generateCodeVerifier() {
        const array = new Uint8Array(32);
        window.crypto.getRandomValues(array);
        return btoa(String.fromCharCode.apply(null, array))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    // Función para generar el code_challenge a partir del code_verifier (SHA-256)
    async function generateCodeChallenge(codeVerifier) {
        const encoder = new TextEncoder();
        const data = encoder.encode(codeVerifier);
        const digest = await window.crypto.subtle.digest('SHA-256', data);
        return btoa(String.fromCharCode.apply(null, new Uint8Array(digest)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    return Controller.extend("vacation.caledar.vacationcalendar.controller.Calendar", {

        onInit: async function () {
            let oModel = new JSONModel(); 
            this.getView().setModel(oModel, "vacationModel");
            try {
                const response = await fetch("http://localhost:3000/api/config");
                if (!response.ok) {
                    throw new Error(`Error fetching configuration: ${response.status}`);
                }

                this.appConfig = await response.json();
                
                const urlParams = new URLSearchParams(window.location.search);
                const authCode = urlParams.get("code");

                if (authCode) {
                    await this.handleAuthCode(authCode);
                    await this.loadVacationData();
                } else {
                    await this.loadVacationData();
                }

                await this.onFetchDepartments();
                await this.loadCurrentUserInfo();

            } catch (err) {
                sap.m.MessageToast.show("Error initializing the app");
                return; 
            }
            
            // Configuración para festivos
            oModel.setProperty("/showHolidays", false);

            // Configuración del modelo de vacaciones
            oModel.attachRequestCompleted(function () {
                let oData = oModel.getData();

                oData.rows.forEach(function (oEmployee) {
                    let iTotalDias = 0;
                    let iDisponibles = 25;

                    if (oEmployee.appointments) {
                        oEmployee.appointments.forEach(function (oApp) {
                            let oInicio = new Date(oApp.startDate);
                            let oFin = new Date(oApp.endDate);
                            let iDias = Math.ceil((oFin - oInicio) / (1000 * 60 * 60 * 24)) + 1;
                            iTotalDias += iDias;
                        });
                    }

                    oEmployee.totalDias = iTotalDias;
                    oEmployee.diasRestantes = iDisponibles - iTotalDias;
                });

                oModel.setData(oData);
            });

            // estadísticas
            this._oStatsModel = new JSONModel();
            this.getView().setModel(this._oStatsModel, "statsModel");
        },

        onToggleHolidays: function(oEvent) {
            const bShowHolidays = oEvent.getParameter("selected");
            const oModel = this.getView().getModel("vacationModel");
            
            oModel.setProperty("/showHolidays", bShowHolidays);
            
            this.updateAppointmentsDisplay();
            
            const sMessage = bShowHolidays ? 
                "Festivos mostrados" : 
                "Festivos ocultos";
            MessageToast.show(sMessage);
        },

        updateAppointmentsDisplay: function() {
            const oModel = this.getView().getModel("vacationModel");
            const aRows = oModel.getProperty("/rows") || [];
            const bShowHolidays = oModel.getProperty("/showHolidays");
            
            aRows.forEach(function(oEmployee) {
                // Combinar appointments según el filtro
                let aAllAppointments = [];
                
                // Siempre incluir appointments de vacaciones (sin festivos)
                if (oEmployee.appointments) {
                    aAllAppointments = oEmployee.appointments.filter(function(app) {
                        return !app.isHoliday;
                    });
                }
                
                // Añadir festivos solo si están habilitados
                if (bShowHolidays && oEmployee.holidayAppointments) {
                    aAllAppointments = aAllAppointments.concat(oEmployee.holidayAppointments);
                }
                
                // Actualizar los appointments mostrados
                oEmployee.displayAppointments = aAllAppointments;
            });
            
            oModel.setProperty("/rows", aRows);
            oModel.updateBindings(true);
        },

        _getText: function (sKey, aArgs) {
            const oBundle = this.getView().getModel("i18n").getResourceBundle();
            return oBundle.getText(sKey, aArgs);
        },

        loadCurrentUserInfo: async function() {
            try {
                const token = await this.getAppToken();
                if (!token) return;

                // Obtener información del usuario actual desde Microsoft Graph
                const response = await fetch("http://localhost:3000/user/profile", {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.ok) {
                    const userData = await response.json();
                    const oModel = this.getView().getModel("vacationModel");
                    const oData = oModel.getData() || {};
                    
                    // PRIORIZAR userPrincipalName sobre mail (coincide con BD)
                    const userEmail = userData.userPrincipalName || userData.mail;
                    
                    // console.log('userData.mail:', userData.mail);
                    // console.log('userData.userPrincipalName:', userData.userPrincipalName);
                    // console.log('Email usado para verificar admin (userPrincipalName):', userEmail);
                    
                    oData.currentUser = {
                        email: userEmail,
                        name: userData.displayName,
                        id: userData.id,
                        isAdmin: false // Se actualizará después
                    };
                    
                    oModel.setData(oData);
                    
                    // Verificar si es admin usando el email correcto
                    await this.checkAdminStatus(userEmail);
                }
            } catch (error) {
                console.error("Error loading current user info:", error);
                MessageToast.show("Error loading user information");
            }
        },

        checkAdminStatus: async function(email) {
            try {
                const response = await fetch(`http://localhost:3000/api/isAdmin?email=${encodeURIComponent(email)}`);
                if (response.ok) {
                    const data = await response.json();
                    const oModel = this.getView().getModel("vacationModel");
                    const oData = oModel.getData() || {};
                    
                    if (!oData.currentUser) oData.currentUser = {};
                    oData.currentUser.isAdmin = data.isAdmin;
                    
                    oModel.setData(oData);
                    
                    this.toggleAdminButton(data.isAdmin);
                    
                    console.log(`User ${email} is admin:`, data.isAdmin);
                }
            } catch (error) {
                console.error("Error checking admin status:", error);
                // Por seguridad, ocultar el botón si hay error
                this.toggleAdminButton(false);
            }
        },

        onGoToAdmin: async function () {
            try {
                const token = sessionStorage.getItem("access_token");
                if (!token) {
                    MessageToast.show("Authentication required");
                    return;
                }

                const userResponse = await fetch("http://localhost:3000/user/profile", {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!userResponse.ok) {
                    MessageToast.show("Error getting user information");
                    return;
                }

                const userData = await userResponse.json();
                const userEmail = userData.userPrincipalName || userData.mail;

                if (!userEmail) {
                    MessageToast.show("User email not found");
                    return;
                }

                // Verificar permisos de administrador
                const adminResponse = await fetch(`http://localhost:3000/api/isAdmin?email=${encodeURIComponent(userEmail)}`);
                
                if (!adminResponse.ok) {
                    MessageToast.show("Error verifying permissions");
                    return;
                }

                const adminData = await adminResponse.json();

                if (adminData.isAdmin) {
                    const oRouter = this.getOwnerComponent().getRouter();
                    oRouter.navTo("admin");
                } else {
                    MessageToast.show("Access denied: Administrator permissions required");
                }

            } catch (error) {
                console.error("Error accessing admin panel:", error);
                MessageToast.show("Error accessing admin panel");
            }
        },

        toggleAdminButton: function(isAdmin) {
            const oAdminButton = this.byId("adminButton"); 
            if (oAdminButton) {
                oAdminButton.setVisible(isAdmin);
            }
        },

        onGlobalSearch: function (oEvent) {
            let sQuery = oEvent.getParameter("newValue");
            // Asegurarse de que sQuery no sea undefined o null antes de toLowerCase()
            sQuery = sQuery ? sQuery.toLowerCase() : "";

            let oModel = this.getView().getModel("vacationModel");
            let oData = oModel.getData();
            // Copia original guardada al cargar el modelo
            let aOriginal = oData.originalRows || oData.rows;

            // Guardar los datos originales si aún no se han guardado
            if (!oData.originalRows) {
                oData.originalRows = JSON.parse(JSON.stringify(oData.rows));
            }

            // Verificar si la búsqueda está vacía, undefined o null
            if (!sQuery || sQuery.trim() === "") {
                // Restaurar los datos originales
                oData.rows = JSON.parse(JSON.stringify(oData.originalRows));
                oModel.setData(oData);
                return;
            }

            // Filtrar el array
            let aFiltered = oData.originalRows.filter(function (oEmployee) {
                let name = (oEmployee.title || "").toLowerCase();
                let email = (oEmployee.email || "").toLowerCase();
                let department = Array.isArray(oEmployee.department) ? oEmployee.department.join(" ").toLowerCase() : "";
            return  name.includes(sQuery) ||
                    email.includes(sQuery) ||
                    department.includes(sQuery);
            });

            oData.rows = aFiltered;
            oModel.setData(oData);
        },

        _applyDepartmentFilter: function() {
            const oCombo = this.byId("filterBy");
            const aKeys  = oCombo.getSelectedItems().map(i => i.getKey());
        
            const oModel = this.getView().getModel("vacationModel");
            const oData  = oModel.getData();
        
            // Guardar copia original si no existe
            if (!oData.originalRows) {
                oData.originalRows = JSON.parse(JSON.stringify(oData.rows));
            }
        
            if (aKeys.length === 0) {
                oData.rows = JSON.parse(JSON.stringify(oData.originalRows));
            } else {
                oData.rows = oData.originalRows.filter(emp => {
                    const depts = emp.department;
                    return Array.isArray(depts)
                        ? depts.some(d => aKeys.includes(d))
                        : aKeys.includes(depts);
                });
            }
            oModel.setData(oData);
        },                
        
        onDepartmentFilter: function(oEvent) {
            this._applyDepartmentFilter();
        },

        onFetchDepartments: async function() {
            try {
              // 1) Traer departamentos del servidor
              const response = await fetch("http://localhost:3000/departments");
              if (!response.ok) {
                throw new Error(`Error fetching departments: ${response.status}`);
              }
              const aDepartments = await response.json();
            //   console.log("Departamentos obtenidos:", aDepartments);
          
              // 2) Actualizar el modelo con la lista bajo la misma propiedad que tu XML bindea
              const oModel = this.getView().getModel("vacationModel");
              if (!oModel) {
                console.warn(this._getText("vacationModelNotReady"));
                return;
                }
              const oData  = oModel.getData() || {};
              oData.department = aDepartments;
              oModel.setData(oData);
          
              // 3) Disparar el filtrado
              this.onDepartmentFilter();
          
              return aDepartments;
            } catch (error) {
            //   console.error("Error fetching departments:", error);
              MessageToast.show(this._getText("errorLoadingDepartments"));
              return [];
            }
        },      

        onSidePanelToggle: function (oEvent) {
            let oPanel = oEvent.getSource();
            let oSplitterLayoutData = this.byId("_IDGenSplitterLayoutData");
            let oSplitter = this.byId("mySplitter");
            if (oPanel.getExpanded()) {
                oSplitterLayoutData.setSize("30%");
            } else {
                oSplitterLayoutData.setSize("6%");
            }
            oSplitter.rerender();
        },

        onEmployeeDrop: function (oEvent) {
            try {
                let oDraggedControl = oEvent.getParameter("draggedControl");
                let oDroppedControl = oEvent.getParameter("droppedControl");
                let sDropPosition = oEvent.getParameter("dropPosition");

                let oModel = this.getView().getModel("vacationModel");
                let aEmployees = oModel.getProperty("/rows");

                let iDraggedIndex = oDraggedControl.getBindingContext("vacationModel").getPath().split("/")[2];
                let iDroppedIndex = oDroppedControl.getBindingContext("vacationModel").getPath().split("/")[2];

                if (sDropPosition === "After") {
                    iDroppedIndex++;
                }

                // Reordenar el array
                let oDraggedEmployee = aEmployees.splice(iDraggedIndex, 1)[0];
                aEmployees.splice(iDroppedIndex, 0, oDraggedEmployee);

                oModel.setProperty("/rows", aEmployees);
                MessageToast.show(this._getText("employeeOrderUpdated"));
            } catch (error) {
                console.error("Error in onEmployeeDrop:", error);
                MessageToast.show(this._getText("errorReorderingEmployee" + error.message));
            }
        },

        handleAuthCode: async function(authCode) {
            // Intercambiar el código por un token
            const success = await this.exchangeAuthCodeForToken(authCode);
            
            if (success) {
                this.loadVacationData();
                window.history.replaceState({}, document.title, window.location.pathname);
            } else {
                MessageToast.show(this._getText("errorObtainingAuthToken"));
            }
        },

        getAuthCode: async function () {
            const codeVerifier = generateCodeVerifier();
            const codeChallenge = await generateCodeChallenge(codeVerifier);
            
            // console.log("Guardando code_verifier:", codeVerifier);
            sessionStorage.setItem("pkce_code_verifier", codeVerifier);
            // console.log("Verificando en sessionStorage (inmediatamente):", sessionStorage.getItem("pkce_code_verifier"));

            const authUrl = `https://login.microsoftonline.com/${this.appConfig.tenantId}/oauth2/v2.0/authorize?` +
                new URLSearchParams({
                    client_id: this.appConfig.clientId,
                    response_type: "code",
                    redirect_uri: this.appConfig.redirectUri,
                    scope: this.appConfig.scope,
                    response_mode: "query",
                    code_challenge: codeChallenge,
                    code_challenge_method: "S256"
                });
            // console.log("getAuthCode: Redirigiendo a:", authUrl);

            setTimeout(() => {
                // console.log("Verificando en sessionStorage (después de 100ms):", sessionStorage.getItem("pkce_code_verifier"));
                window.location.href = authUrl;
            }, 100);

        },

        getAuthCodeFromUrl: function () {
            const params = new URLSearchParams(window.location.search);
            return params.get("code");
        },

        exchangeAuthCodeForToken: async function (authCode) {
            try {
                const codeVerifier = sessionStorage.getItem("pkce_code_verifier");
                if (!codeVerifier) {
                    throw new Error(this._getText("codeVerifierNotFound"));
                }
        
                const response = await fetch("http://localhost:3000/auth/token", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ code: authCode, code_verifier: codeVerifier })
                });
        
                const data = await response.json();
                // console.log("exchangeAuthCodeForToken: Respuesta del backend:", data);
        
                if (data.access_token) {
                    sessionStorage.setItem("access_token", data.access_token);
                    return true;
                } else {
                    throw new Error(data.error_description || "Failed to get access token");
                }
            } catch (error) {
                console.error(this._getText("errorExchAuthCodeForToken", error));
                return false;
            }
        },  

        getAppToken: async function () {
            let token = sessionStorage.getItem("access_token");
            // console.log("getAppToken: Token actual:", token);
            if (token) return token;

            const urlParams = new URLSearchParams(window.location.search);
            const authCode = urlParams.get("code");

            if (authCode) {
                const success = await this.exchangeAuthCodeForToken(authCode);
                // console.log("getAppToken: Intercambio de token:", success);
                if (success) return sessionStorage.getItem("access_token");
            } else {
                await this.getAuthCode();
            };
        },

        loadVacationData: async function () {
            const token = await this.getAppToken();

            try {
                const response = await fetch("http://localhost:3000/employees");
                if (!response.ok) throw new Error(`Error fetching employees: ${response.status}`);
                const employees = await response.json();

                // Cargar nombres rápidamente
                const namePromises = employees.map(emp => this.getUserNames(emp.id, token));
                const names = await Promise.all(namePromises);

                // Mapear empleados y añadir appointments de festivos
                const rows = employees.map((emp, i) => {

                    const holidayAppointments = this.convertHolidaysToAppointments(emp.holidays || []);
                    return {
                        id: emp.id,
                        title: names[i]?.name || "Sin nombre",
                        email: emp.email,
                        department: emp.departments,
                        icon: "sap-icon://person-placeholder",
                        admin: emp.admin,
                        city_id: emp.city_id,
                        city_name: emp.city_name,
                        appointments: [], // Se llenará con getUserEvents
                        holidayAppointments: holidayAppointments, 
                        
                    };
                });
                console.log("Cargando datos de empleados:", rows);

                // Mostrar el calendario con nombres y festivos
                const oModel = this.getView().getModel("vacationModel");
                oModel.setProperty("/rows", rows);
                // oModel.updateBindings(true);

                MessageToast.show(this._getText("loadingDataMessage"));

                // Cargar eventos *en paralelo* sin bloquear UI
                const appointmentsPromises = employees.map(emp => this.getUserEvents(emp.id, token));
                const allAppointments = await Promise.all(appointmentsPromises);

                // Insertar eventos y actualizar modelo de nuevo
                rows.forEach((row, i) => {
                    row.appointments = allAppointments[i];
                });

                oModel.setProperty("/rows", rows);

                this.updateAppointmentsDisplay();
                // oModel.updateBindings(true);
                MessageToast.show(this._getText("loadingDataSuccess"));

            } catch (error) {
                console.error("Error loading data:", error);
                MessageToast.show("Error loading data");
            }
        },

        convertHolidaysToAppointments: function(holidays) {
            if (!holidays || !Array.isArray(holidays)) {
                return [];
            }

            return holidays.map(holiday => {
                let dateValue = holiday.date;
                if (typeof dateValue === "object" && dateValue.date) {
                    dateValue = dateValue.date;
                }

                let parts = typeof dateValue === "string" ? dateValue.split("-") : [];
                let holidayDate = parts.length === 3
                    ? new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
                    : new Date(dateValue);

                holidayDate.setDate(holidayDate.getDate() + 1);

                if (isNaN(holidayDate.getTime())) {
                    console.warn("Fecha de festivo inválida:", holiday);
                    return null;
                }

                const startDate = new Date(holidayDate);
                startDate.setHours(0, 0, 0, 0);

                const endDate = new Date(holidayDate);
                endDate.setHours(23, 59, 59, 999);

                return {
                    startDate: startDate,
                    endDate: endDate,
                    title: holiday.title || "Festivo",
                    type: CalendarDayType.Type01,
                    tooltip: `${holiday.title} - ${holiday.city || ""}`,
                    isHoliday: true
                };
            }).filter(Boolean);
        },
        
        getUserNames: async function (userId, token) {
            try {
                const response = await fetch(`http://localhost:3000/user/${userId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                if (!response.ok) {
                    throw new Error(this._getText("errorFetchingUserData " + userId));
                }
                
                const data = await response.json();
                // console.log("getUserNames data:", data);
                return {
                    name: data.name
                };
                
            } catch (error) {
                console.error(this._getText("errorFetchingUserData ", userId));
                return {};
            }
        },

        getUserEvents: async function (email, token) {
            // console.log("Ejecutando getUserEvents con email:", email);
            try {
                const response = await fetch(`http://localhost:3000/user/${email}/events`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
        
                if (!response.ok) {
                    throw new Error(this._getText("errorFetchingEventsUser " + email));
                }
        
                const data = await response.json();
                const events = data.value || [];
                // console.log(data)
                return events.map(event => {
                    // Parsear las fechas desde el string ISO
                    const startDate = new Date(event.start.dateTime);
                    const endDate = new Date(event.end.dateTime);
                    
                    return {
                        startDate: startDate,
                        endDate: endDate,
                        title: event.subject,
                        type: CalendarDayType.Type07,
                        tooltip: event.subject
                    };
                });
            } catch (error) {
                console.error(this._getText(`errorFetchingEventsUser ${email}:`, error));
                return [];
            }
        },

        // getUserPhoto: async function (email, token) {
        //     console.log("Ejecutando getUserPhoto con email:", email);
        //     try {
        //         const response = await fetch("http://localhost:3000/user/profile_pic", {
        //             headers: { 'Authorization': `Bearer ${token}` }
        //         });
        
        //         if (!response.ok) {
        //             throw new Error("Error fetching photo for user: " + email);
        //         }
        
        //         // Convertir la respuesta a blob (imagen)
        //         const blob = await response.blob();
        //         const imageUrl = URL.createObjectURL(blob); // Crear URL de la imagen
        //         console.log(imageUrl)
        
        //         const oModel = this.getView().getModel("vacationModel");
        //         const oData = oModel.getData();
        
        //         // Actualizar el modelo con la imagen
        //         oData.rows[0].icon = imageUrl;
        //         oModel.refresh(true);
        
        //     } catch (error) {
        //         console.warn("No profile picture found for user:", email);
        //         return "sap-icon://person-placeholder"; // Icono por defecto si no hay foto
        //     }
        // },

        formatDate: function (sDate) {
            if (sDate) {
                return new Date(sDate);
            }
            return null;
        },

        formatDateRange: function (sStartDate, sEndDate) {
            if (!sStartDate || !sEndDate) return "";

            let oStartDate = new Date(sStartDate);
            let oEndDate = new Date(sEndDate);

            let options = { day: "2-digit", month: "short" };

            let formatedStartDate = oStartDate.toLocaleDateString("en-GB", options);
            let formatedEndDate = oEndDate.toLocaleDateString("en-GB", options);

            return `${formatedStartDate} to ${formatedEndDate}`;
        },

        formatRowText: function (sCargo, iTotalDias, iDiasRestantes) {
            return `${sCargo} · ${iTotalDias} days used - ${iDiasRestantes} remaining.`;
        },

        onRowPress: function (oEvent) {
            const oCalendar = this.byId("_IDGenPlanningCalendar");
            if (!oCalendar) {
                sap.m.MessageToast.show(this._getText("calendarNotFound"));
                return;
            }
        
            const aSelectedRows = oCalendar.getSelectedRows();
            if (!aSelectedRows || aSelectedRows.length === 0) {
                sap.m.MessageToast.show(this._getText("noRowSelected"));
                return;
            }
        
            const oRow = aSelectedRows[0];
            const oContext = oRow.getBindingContext("vacationModel");
            if (!oContext) {
                sap.m.MessageToast.show(this._getText("employeeContextNotFound"));
                return;
            }
        
            const sPath = oContext.getPath();
            const oModel = this.getView().getModel("vacationModel");
            const oEmpleado = oModel.getProperty(sPath);
            if (!oEmpleado || !oEmpleado.id) {
                sap.m.MessageToast.show(this._getText("invalidEmployee"));
                return;
            }
        
            const sEmployeeId = oEmpleado.id;
        
            // Asegurarse de que el modelo esté sincronizado con el componente
            const oComponentModel = this.getOwnerComponent().getModel("vacationModel") || new sap.ui.model.json.JSONModel();
            oComponentModel.setData(oModel.getData());
            this.getOwnerComponent().setModel(oComponentModel, "vacationModel");
        
            // Comprobamos si ya estamos en esa ruta
            const oRouter = this.getOwnerComponent().getRouter();
            const oHashChanger = sap.ui.core.routing.HashChanger.getInstance();
            const sCurrentHash = oHashChanger.getHash();
            const sTargetHash = `employee/${sEmployeeId}`;
        
            if (sCurrentHash !== sTargetHash) {
                oRouter.navTo("employeeDetail", { employeeId: sEmployeeId });
            }
        },

        onAppointmentSelect: function (oEvent) {
            const oAppointment = oEvent.getParameter("appointment");
            const oBindingContext = oAppointment.getBindingContext("vacationModel");
            const oData = oBindingContext.getObject();

            const sFormattedDateRange = this.formatDateRange(oData.startDate, oData.endDate);
        
            if (!this._oPopover) {
                this._oPopover = new sap.m.ResponsivePopover({
                    title: this._getText("details"),
                    contentWidth: "250px",
                    placement: sap.m.PlacementType.Auto,
                    content: new sap.ui.layout.form.SimpleForm({
                        content: [
                            new sap.m.Label({ text: this._getText("popUpTitle") }),
                            new sap.m.Text({ text: oData.title }),
                            new sap.m.Label({ text: this._getText("duration") }),
                            new sap.m.Text({ text: sFormattedDateRange })
                        ]
                    }),
                    endButton: new sap.m.Button({
                        text: "Close",
                        press: function () {
                            this._oPopover.close();
                        }.bind(this)
                    }),
                    afterClose: function () {
                        this._oPopover.destroy();
                        this._oPopover = null;
                    }.bind(this)
                });
            }
        
            this._oPopover.openBy(oAppointment);
        },
        
        onPressButton: function () {
            let oRouter = this.getOwnerComponent().getRouter(this);
            oRouter.navTo("admin", {
                employeeId: "new"
            });
        },

    });
});