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
            let sEmployeeId = oEvent.getParameter("arguments").employeeId;
        
            if (!sEmployeeId) {
                MessageToast.show("No se encontró el ID del empleado");
                return;
            }
        
            let oModel = this.getView().getModel("vacationModel");
        
            // Si los datos aún no están listos, esperar a que el modelo termine de cargar
            if (!oModel.getData() || !oModel.getData().rows) {
                oModel.attachRequestCompleted(() => this._setEmployeeData(sEmployeeId));
                oModel.refresh(true);
            } else {
                this._setEmployeeData(sEmployeeId);
            }
        },
        
        _setEmployeeData: function (sEmployeeId) {
            let oModel = this.getView().getModel("vacationModel");
            let sPath = "/rows/" + sEmployeeId;
            let oEmployee = oModel.getProperty(sPath);
        
            if (!oEmployee) {
                MessageToast.show("Empleado no encontrado");
                return;
            }
            
            if (oEmployee.totalDias === undefined || oEmployee.diasRestantes === undefined) {
                let iTotalDias = 0;
        
                if (oEmployee.appointments) {
                    oEmployee.appointments = oEmployee.appointments.map(app => {
                        return {
                            title: app.title,
                            type: app.type,
                            startDate: UI5Date.getInstance(new Date(app.startDate)),
                            endDate: UI5Date.getInstance(new Date(app.endDate))
                        };
                    });
                }

            oEmployee.appointments.forEach(oApp => {
                let iDias = Math.ceil((oApp.endDate - oApp.startDate) / (1000 * 60 * 60 * 24)) + 1;
                iTotalDias += iDias;
            });
        
            oEmployee.totalDias = iTotalDias;
            oEmployee.diasRestantes = 25 - iTotalDias;
        
            // 🔄 Guardar los datos actualizados en el modelo
            oModel.setProperty(sPath, oEmployee);
            }
            // console.log("Empleado encontrado:", oEmployee);
            // console.log("Días consumidos:", oEmployee.totalDias);
            // console.log("Días restantes:", oEmployee.diasRestantes);
        
            let oStatsModel = new JSONModel({
                diasConsumidos: oEmployee.totalDias || 0,
                diasRestantes: oEmployee.diasRestantes || 25,
                diasMaximos: 25
            });
        
            this.getView().setModel(oStatsModel, "statsModel");
        
            this.getView().bindElement({
                path: sPath,
                model: "vacationModel"
            });
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
