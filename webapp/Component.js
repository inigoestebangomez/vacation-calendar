sap.ui.define([
    "sap/ui/core/UIComponent",
    "vacation/caledar/vacationcalendar/model/models"
], function (UIComponent, models) {
    "use strict";

    return UIComponent.extend("vacation.caledar.vacationcalendar.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init: function () {
            // call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // set the device model
            this.setModel(models.createDeviceModel(), "device");

            // enable routing
            this.getRouter().initialize();
        }
    });
});