// @ts-nocheck
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/ui/core/dnd/DragInfo",
    "sap/ui/core/dnd/DropInfo"
], function (Controller, JSONModel, MessageToast, DragInfo, DropInfo) {
    "use strict";

    return Controller.extend("vacation.caledar.vacationcalendar.controller.Calendar", {
        onInit: function () {
            //para cuando funcione el servicio
            // this.appConfig = {
            //     clientId: "CLIENT_ID", // Client ID de Microsoft Entra ID
            //     clientSecret: "CLIENT_SECRET", // Client Secret de Microsoft.
            //     tenantId: "https://login.microsoftonline.com/_TENANT_ID", // Tenant ID
            //     scopes: ["Calendars.Read.All", "User.Read.All"]
            // };
  
           let oModel = new JSONModel();
           this.getView().setModel(oModel, "vacationModel");
           //this.loadVacationData(); //para cuando funcione el servicio

            //    oModel.attachRequestCompleted(function() {
            //     console.log("Modelo cargado:", oModel.getData());
            //     });

           oModel.loadData("mockdata/vacationModel.json")

           this.getView().attachAfterRendering(function(){
                let oCalendar = this.byId("_IDGenPlanningCalendar");
            if (oCalendar) {
                oCalendar.setStartDate(new Date());
            }
        }.bind(this));

        },

        onSidePanelToggle: function (oEvent) {
            let oPanel = oEvent.getSource();
            let oSplitterLayoutData = this.byId("_IDGenSplitterLayoutData");
            let oSplitter = this.byId("mySplitter");
            if (oPanel.getExpanded()) {
                oSplitterLayoutData.setSize("30%");
            } else {
                oSplitterLayoutData.setSize("7%");
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
                MessageToast.show("Employee order updated");
            } catch (error) {
                console.error("Error in onEmployeeDrop:", error);
                MessageToast.show("Error reordering employee: " + error.message);
            }
        },

        getAppToken: async function() {
            try {
                const response = await fetch(`https://login.microsoftonline.com/${this.appConfig.tenantId}/oauth2/v2.0/token`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: new URLSearchParams({
                        client_id: this.appConfig.clientId,
                        client_secret: this.appConfig.clientSecret,
                        scope: 'https://graph.microsoft.com/.default',
                        grant_type: 'client_credentials'
                    })
                });

                const data = await response.json();
                return data.access_token;
            } catch (error) {
                MessageToast.show("Error when getting token: " + error);
                throw error;
            }
        },

        loadVacationData: async function() {
            try {
                const token = await this.getAppToken();
                
                const response = await fetch('https://graph.microsoft.com/v1.0/users', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const userData = await response.json();

                const usersWithEvents = await Promise.all(userData.value.map(async user => {
                    const [events, photo] = await Promise.all([
                        this.getUserEvents(user.id, token),
                        this.getUserPhoto(user.id, token)
                    ]);

                    return {
                        icon: photo,
                        title: user.displayName,
                        appointments: events.map(event => ({
                            startDate: new Date(event.start.dateTime),
                            endDate: new Date(event.end.dateTime),
                            title: "Vacaciones",
                            type: "Type05"
                        }))
                    };
                }));

                const oModel = this.getView().getModel("vacationModel");

                oModel.setData({
                    rows: usersWithEvents
                });

            } catch (error) {
                MessageToast.show("Error when getting data: " + error);
            }
        },

        getUserEvents: async function(userId, token) {
            try {
                const response = await fetch(
                    `https://graph.microsoft.com/v1.0/users/${userId}/calendar/events?$filter=subject eq 'Vacaciones'`,
                    { headers: { 'Authorization': `Bearer ${token}` } }
                );
        
                if (!response.ok) {
                    throw new Error("Error fetching events for user: " + userId);
                }
        
                const data = await response.json();
                return data.value || [];
            } catch (error) {
                console.error(error);
                return [];
            }
        },
        
        getUserPhoto: async function(userId, token) {
            try {
                const response = await fetch(
                    `https://graph.microsoft.com/v1.0/users/${userId}/photo/$value`,
                    { headers: { 'Authorization': `Bearer ${token}` } }
                );
        
                if (!response.ok) {
                    throw new Error("Error fetching photo for user: " + userId);
                }
        
                const blob = await response.blob();
                return URL.createObjectURL(blob);
            } catch (error) {
                console.warn("No profile picture found for user:", userId);
                return "sap-icon://person-placeholder";
            }
        },

        formatDate: function(sDate) {
            if (sDate) {
                return new Date(sDate);
            }
            return null;
        },

        formatDateRange: function(sStartDate, sEndDate) {
            if (!sStartDate || !sEndDate) return "";
        
            let oStartDate = new Date(sStartDate);
            let oEndDate = new Date(sEndDate);
        
            let options = { day: "2-digit", month: "short" };
        
            return `${oStartDate.toLocaleDateString("en-GB", options)} to ${oEndDate.toLocaleDateString("en-GB", options)}`;
        }
        
        
    });
});