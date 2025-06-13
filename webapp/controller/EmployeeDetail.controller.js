sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/ui/core/UIComponent",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/ui/core/date/UI5Date"
], function (Controller, History, UIComponent,JSONModel, MessageToast, UI5Date) {
    "use strict";

    return Controller.extend("vacation.caledar.vacationcalendar.controller.EmployeeDetail", {
        
        _data : {
			dtValue: UI5Date.getInstance(),
			dtPattern: undefined
		},
        
        onInit: function () {
            let oRouter = sap.ui.core.UIComponent.getRouterFor(this);
            oRouter.getRoute("employeeDetail").attachPatternMatched(this._onRouteMatched, this);
        },

        getRouter : function () {
			return UIComponent.getRouterFor(this);
		},
        
        _onRouteMatched: function (oEvent) {
            const sEmployeeId = oEvent.getParameter("arguments").employeeId;
            console.log("ID recibido en employeeDetail:", sEmployeeId);
        
            const oModel = this.getOwnerComponent().getModel("vacationModel");
            if (!oModel) {
                sap.m.MessageToast.show("Data model not found");
                return;
            }
        
            const oData = oModel.getData();
            
            if (!oData || !oData.rows) {
                oModel.attachRequestCompleted(() => this._setEmployeeData(sEmployeeId));
                return;
            }
        
            const aRows = oData.rows;
            // console.log("IDs disponibles en vacationModel:", aRows.map(emp => emp.id));
        
            const oEmployee = aRows.find(emp => emp.id == sEmployeeId);
            // console.log("Empleado encontrado en employeeDetail:", oEmployee);
        
            if (!oEmployee) {
                sap.m.MessageToast.show("Employee not found");
                return;
            }
        
            this._setEmployeeData(sEmployeeId);
        },
        
        _setEmployeeData: function (sEmployeeId) {
            // Obtener el modelo del componente
            let oModel = this.getOwnerComponent().getModel("vacationModel");
            
            // Obtener las filas
            let aRows = oModel.getProperty("/rows") || [];
            // console.log("Filas disponibles para búsqueda:", aRows);
            
            // Buscar el empleado por ID
            let oEmployee = aRows.find(emp => emp.id == sEmployeeId);
            // console.log("Empleado encontrado para ID", sEmployeeId, ":", oEmployee);
            
            if (!oEmployee) {
                MessageToast.show("Employee not found");
                return;
            }
            
            // Calcular días
            if (oEmployee.totalDias === undefined || oEmployee.diasRestantes === undefined) {
                let iTotalDias = 0;
                const currentYear = new Date().getFullYear();
                
                // Verificar si hay citas y procesar las fechas
                if (oEmployee.appointments && oEmployee.appointments.length > 0) {
                    // Convertir fechas string a objetos Date usando UI5Date
                    oEmployee.appointments = oEmployee.appointments.map(app => {
                        return {
                            title: app.title,
                            type: app.type,
                            startDate: UI5Date.getInstance(new Date(app.startDate)),
                            endDate: UI5Date.getInstance(new Date(app.endDate))
                        };
                    }).filter(app => {
                        return app.startDate.getFullYear() === currentYear;
                    })
                    
                    // Calcular total de días
                    oEmployee.appointments.forEach(oApp => {
                        let iDias = countWeekdays(oApp.startDate, oApp.endDate);
                        iTotalDias += iDias;
                    });
                }
                
                // Actualizar datos del empleado
                oEmployee.totalDias = iTotalDias;
                oEmployee.diasRestantes = 25 - iTotalDias;
                
                // Obtener el índice del empleado para actualizar correctamente
                let iIndex = aRows.indexOf(oEmployee);
                
                // Actualizar la propiedad en el modelo con los datos modificados
                if (iIndex >= 0) {
                    oModel.setProperty("/rows/" + iIndex, oEmployee);
                }
            }

            function countWeekdays(startDate, endDate) {
                let iDays = 0;
                let current = new Date(startDate.getTime());

                while (current < endDate) {
                    const day = current.getDay();
                    if (day !== 0 && day !== 6) {
                        iDays++;
                    }
                    current.setDate(current.getDate() + 1);
                }
                return iDays;
            }
            // console.log("Empleado procesado:", oEmployee);
            // console.log("Días consumidos:", oEmployee.totalDias);
            // console.log("Días restantes:", oEmployee.diasRestantes);
            
            // Crear modelo de estadísticas
            let oStatsModel = new JSONModel({
                diasConsumidos: oEmployee.totalDias || 0,
                diasRestantes: oEmployee.diasRestantes || 25,
                diasMaximos: 25
            });
            
            // Asegurar que la vista tenga el modelo actualizado
            this.getView().setModel(oModel, "vacationModel");
            this.getView().setModel(oStatsModel, "statsModel");
            
            // Establecer el binding al objeto empleado específico
            let iIndex = aRows.indexOf(oEmployee);
            if (iIndex >= 0) {
                this.getView().bindElement({
                    path: "/rows/" + iIndex,
                    model: "vacationModel"
                });
            } else {
                console.error("No se pudo encontrar el índice del empleado para binding");
            }
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
    });
});
