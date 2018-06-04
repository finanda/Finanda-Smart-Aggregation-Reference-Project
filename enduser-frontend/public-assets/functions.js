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
            if (error.includes("ETIMEDOUT") || error.includes("ECONNREFUSED"))
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
            $("#loading").html('This results are based on the FSA API calls the server made and returned to enduser UI.<br/>' +
                '<strong>Note: </strong> More information is available in the raw response returned by the API - this reference project does not print all of the returned data.<br/><br/><br/>');
            // accountsArray is array of all accounts the enduser have
            // from this point forward you decide what to show in the enduser's UI
            var accountNum = 0;
            accountsArray.forEach(function (json) {
                // In this example we chose to handle only checking accounts,
                // obliviously you can handle any type of account.
                // Beware of the properties each account type have
                if (json.hasOwnProperty('type') && !json.hasOwnProperty('download_error'))
                {
                    $("#results_tables")
                        .append(`<table id="results_table_${accountNum}" class="table"><thead></thead><tbody></tbody></table><br/><br/>`);

                    var accountDetails = [];

                    if (json.type !== undefined)
                    {
                        accountDetails.push({"Account Type": json.type});
                    }
                    if (json.number !== undefined && json.branch !== undefined)
                    {
                        accountDetails.push({"Account Number/Branch": `${json.number} / ${json.branch}`});
                    }
                    if (json.parent_account !== undefined)
                    {
                        accountDetails.push({"Parent account": json.parent_account});
                    }
                    if (json.linked_account !== undefined)
                    {
                        accountDetails.push({"Linked account": json.linked_account});
                    }
                    if (json.number !== undefined)
                    {
                        accountDetails.push({"Card number": json.number});
                    }
                    if (json.card_club !== undefined)
                    {
                        accountDetails.push({"Card club": json.card_club});
                    }
                    if (json.credit_limit !== undefined)
                    {
                        accountDetails.push({"Credit limit": json.credit_limit});
                    }
                    if (json.balance !== undefined && json.currency !== undefined)
                    {
                        accountDetails.push({"Account Balance": `${json.balance} ${json.currency}`});
                    }
                    if (json.client_type !== undefined)
                    {
                        accountDetails.push({"Client type": json.client_type});
                    }

                    if (json.type === "checking-ILS" || json.type === "checking-foreign") {
                        var mapColumnNameToValue = function (json) {
                            return [
                                {"Date": json.date},
                                {"Description": json.description},
                                {"Debit": json.debit},
                                {"Credit": json.credit},
                                {"Category": json.Category},
                            ];
                        };
                    }
                    else if (json.type === "card") {
                        var mapColumnNameToValue = function (json) {
                            return [
                                {"Date": json.date},
                                {"Value date": json.value_date},
                                {"Payee name": json.payee_name},
                                {"Billing sum": json.billing_sum},
                                {"Purchase sum": json.purchase_sum},
                                {"Category": json.Category},
                            ];
                        };
                    }
                    else if (json.type === "loans") {
                        var mapColumnNameToValue = function (json) {
                            return [
                                {"Balance": json.balance},
                                {"Currency": json.currency},
                                {"Upcoming payment date": json.upcoming_payment_date},
                                {"Upcoming payment sum": json.upcoming_payment_sum},
                            ];
                        };
                    }
                    else if (json.type === "savings") {
                        var mapColumnNameToValue = function (json) {
                            return [
                                {"End date": json.end_date},
                                {"Currency": json.currency},
                                {"Expected end value": json.expected_end_value},
                                {"Origination date": json.origination_date},
                                {"Value date": json.value_date}
                            ];
                        };
                    }
                    else if (json.type === "investments") {
                        var mapColumnNameToValue = function (json) {
                            return [
                                {"Daily percents change": json.daily_percents_change},
                                {"Daily value change": json.daily_value_change},
                                {"Price": json.price},
                                {"Purchase price": json.purchase_price},
                                {"Quantity": json.quantity}
                            ];
                        };
                    }

                    if ((json.type === "checking-ILS" || json.type === "checking-foreign" || json.type === "card" || json.type === "investments")) {
                        if (json.type === "investments")
                        {
                            var transactionsArray = json.securities;
                        }
                        else
                        {
                            var transactionsArray = json.transactions;
                            if (transactionsArray.length === 0) { // No need to process an empty account
                                return;
                            }
                        }
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
                    }
                    else if (json.type === "loans" || json.type === "savings")
                    {
                        tr = $('<tr/>');
                        columns = mapColumnNameToValue(json);
                        columns.forEach(function (element) {
                            var key = Object.keys(element)[0];
                            tr.append(`<td>${element[key]}</td>`);
                        });
                        $(`#results_table_${accountNum} tbody`).append(tr);
                    }

                    accountDetails.forEach(function (element) {
                        var key = Object.keys(element)[0];
                        $(`#results_table_${accountNum} thead`)
                            .append(`<tr><td colspan="${columns.length}"><strong>${key}</strong>: ${element[key]}</td></tr>`);
                    });

                    columns.forEach(function (element) {
                        var key = Object.keys(element)[0];
                        $(`#results_table_${accountNum} thead`)
                            .append(`<th>${key}</th>`);
                    });
                    accountNum++;
                }

            });
        })
        .catch(function (error) {
            $("#submit").attr("disabled", false);
            $("#loading").html(`<p style="color: red; font-weight: bold">${error}</p>`);
        });
});