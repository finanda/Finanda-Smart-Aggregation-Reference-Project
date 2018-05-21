function serverCall(url) {
    return new Promise(function(resolve,reject) {
        $.ajax({
            url: url,
            type: 'GET',
            success: function(data) {
                if (data.success === true) {
                    resolve(data);
                }
                else
                {
                    var error = "FSA API Error: " + data.errorMessage;
                    console.log(error);
                    reject(error);
                }
            },
            error: function(data) {
                var error = "Server Error: " + data.status + " " + data.statusText;
                console.log(error);
                reject(error);
            }
        });
    });
}

var credentialsByInstituteCode = [];
var instituteCode = 0;

$(document).ready(function()
{
    $("#main_section").hide();
    $("#main").append('<div id="connectivity_check">Checking API connectivity...<br/><br/><div class="loader"></div></div>');
    serverCall('callGetCredentialsSchema')
        .then(function (data) {
            $("#connectivity_check").remove();
            $("#main_section").show();
            $("#institutes_list").append("<option value='0'>Israeli-family Bank</option>");
            var schema = data.credentialsSchema;
            for (var key in schema) {
                if (schema.hasOwnProperty(key)) {
                    console.log(schema[key].instituteDescription);
                    var instituteCode = schema[key].instituteCode;
                    var instituteName = schema[key].instituteDescription;
                    var instituteParameters = schema[key].parameters;
                    $("#institutes_list").append("<option value='" + instituteCode + "'>" + instituteName + "</option>");
                    credentialsByInstituteCode[instituteCode] = instituteParameters;
                }
            }
        })
        .catch(function (error) {
            $("#main_section").remove();
            // This message is shown only because you aren't a registered customer for the FSA service
            // or your's CUSTOMER_ID and CUSTOMER_SECRET_KEY wasn't correct
            // This message should be replaced with a proper error message that can occur on you server (server.js file)
            if (error.includes("ETIMEDOUT"))
            {
                $("#connectivity_check").html('<p><strong>' +
                    'You must be a registered customer for using or testing the FSA service. You can register at ' +
                    '<a href="https://www.finanda.com/api/registration/" target="_blank">finanda.com/api/registration/</a>' +
                    '</strong></p>')
            }
            else
            {
                $("#connectivity_check").html('<p style="color: red"><strong>' + error + '</strong></p>')
            }
        });
});

$("#institutes_list").change(function() {
    instituteCode = $("select option:selected").attr('value');
    if (instituteCode === "0") {
        $("#credentials_input").hide();
        return;
    }
    $("#credentials_input").show();
    $("#credentials_list").html('');
    var credentials = credentialsByInstituteCode[instituteCode];
    var type = "text";
    for (var key in credentials) {
        if (credentials.hasOwnProperty(key)) {
            var parameterName = credentials[key].parameterName;
            var parameterLabel = credentials[key].label;
            if (parameterName === "pwd") {
                type = "password";
            }
            $("#credentials_list")
                .append(`<div class="form__field form__field--visible"><input id="${parameterName}" type="${type}" value="" class="form__input form__input--text" placeholder="${parameterLabel}"></div>`);
        }
    }
});

$("#submit").click(function() {
    $("#submit").attr("disabled", true);
    $("#results_tables").text('');
    $("#results_output").show();
    $("#loading").html('Loading results...<br/><br/><div class="loader"></div>');
    // Get credentials from input tags which appear on #credentials_list
    var uid = $("#uid").val() === undefined ? "" : $("#uid").val();
    var pwd = $("#pwd").val() === undefined ? "" : $("#pwd").val();
    var vcA = $("#vcA").val() === undefined ? "" : $("#vcA").val();
    var vcB = $("#vcB").val() === undefined ? "" : $("#vcB").val();
    var params = `instituteID=${instituteCode}&uid=${uid}&pwd=${pwd}&vcA=${vcA}&vcB=${vcB}&`;

    serverCall(`runJobAndDisplayResults?${params}`)
        .then(function (data) {
            $('#submit').attr("disabled", false);
            $('html, body').animate({ scrollTop: $('#results_output').offset().top }, 1000); // Just a nice scroll animation
            var accountsArray = data.results;
            console.log(accountsArray);
            $("#loading").html('This results are based on the FSA API calls the server made and returned to enduser UI<br/><br/><br/>');
            // accountsArray is array of all accounts the enduser have
            // from this point forward you decide what to show in the enduser's UI
            var accountNum = 0;
            accountsArray.forEach(function (json) {
                // In this example we chose to handle only checking accounts,
                // obliviously you can handle any type of account.
                // Beware of the properties each account type have
                if (json.hasOwnProperty('transactions') && json.type.indexOf("checking") > -1)
                {
                    var transactionsArray = json.transactions;
                    if (transactionsArray.length === 0) { // No need to process an empty account
                        return;
                    }

                    $("#results_tables")
                        .append(`<table id="results_table_${accountNum}" class="table"><thead></thead><tbody></tbody></table><br/><br/>`);

                    var accountDetails = [
                        {"Account Number/Branch": `${json.number} / ${json.branch}`},
                        {"Account Type": json.type},
                        {"Account Balance": `${json.balance} ${json.currency}`},
                        {"Client type": json.client_type},
                    ];

                    var mapColumnNameToValue = function(json) {
                        return [
                            {"Date": json.date},
                            {"Description": json.description},
                            {"Debit": json.debit},
                            {"Credit": json.credit},
                            {"Category": json.Category},
                        ];
                    };
                    var tr, columns;
                    transactionsArray.forEach(function(json) {
                        tr = $('<tr/>');
                        columns = mapColumnNameToValue(json);
                        columns.forEach(function(element) {
                            var key = Object.keys(element)[0];
                            tr.append(`<td>${element[key]}</td>`);
                        });
                        $(`#results_table_${accountNum} tbody`).append(tr);
                    });

                    accountDetails.forEach(function(element) {
                        var key = Object.keys(element)[0];
                        $(`#results_table_${accountNum} thead`)
                            .append(`<tr><td colspan="${columns.length}"><strong>${key}</strong>: ${element[key]}</td></tr>`);
                    });

                    columns.forEach(function(element) {
                        var key = Object.keys(element)[0];
                        $(`#results_table_${accountNum} thead`)
                            .append(`<th>${key}</th>`);
                    });
                    accountNum++;
                }
            });

            $("#results_tables").append('<br/>\n' +
                '<p><strong>Note: </strong>You can add here more columns which appears on the return JSON Object from <strong>jobResults</strong></p>');
        })
        .catch(function (error) {
            $("#submit").attr("disabled", false);
            $("#loading").html(`<p style="color: red; font-weight: bold">${error}</p>`);
        });
});