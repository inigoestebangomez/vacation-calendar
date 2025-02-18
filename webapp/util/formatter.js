// eslint-disable-next-line no-undef
sap.ui.define([], function () {
    "use strict";
    
    return {

        formatDateRange: function (sStartDate, sEndDate) {
            if (!sStartDate || !sEndDate) return "";

            let oStartDate = new Date(sStartDate);
            let oEndDate = new Date(sEndDate);

            let options = { day: "2-digit", month: "short" };

            // @ts-ignore
            return `${oStartDate.toLocaleDateString("en-GB", options)} to ${oEndDate.toLocaleDateString("en-GB", options)}`;
        },

        formatRowText: function (sCargo, iTotalDias, iDiasRestantes) {
            return `${sCargo} · ${iTotalDias} days used - ${iDiasRestantes} remaining.`;
        },

        
    };
});