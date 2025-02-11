// @ts-nocheck
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/commons/MessageToast",
], function (Controller, JSONModel,MessageToast) {
    "use strict";

    return Controller.extend("vacation.caledar.vacationcalendar.controller.Calendar", {
        onInit: function () {
            // this.appConfig = {
            //     clientId: "CLIENT_ID", // Client ID de Microsoft Entra ID
            //     clientSecret: "CLIENT_SECRET", // Client Secret de Microsoft.
            //     tenantId: "https://login.microsoftonline.com/_TENANT_ID", // Tenant ID
            //     scopes: ["Calendars.Read.All", "User.Read.All"]
            // };
  
           var oModel = new JSONModel();
           this.getView().setModel(oModel, "vacationModel");
           //this.loadVacationData(); //para cuando funcione el servicio

           oModel.attachRequestCompleted(function() {
            console.log("Modelo cargado:", oModel.getData());
        });

           oModel.loadData("mockdata/vacationModel.json")

           this.getView().attachAfterRendering(function(){
            var oCalendar = this.byId("_IDGenPlanningCalendar");
            if (oCalendar) {
                oCalendar.setStartDate(new Date("2025-07-01T00:00:00"));
            }
        }.bind(this));

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
        }
    });
});