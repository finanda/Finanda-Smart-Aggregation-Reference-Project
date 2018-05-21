const express = require('express');
const request = require('request');
const app = express();
app.use(express.static('../enduser-frontend'));


/*************************************/
/* Server backend and API Settings   */
/*************************************/

const PORT = 5000;
const FSA_API = 'https://api.finanda.co.il:443/';
const NUMBER_OF_ITERATIONS = 50; // How much times to call jobStatus
const INTERVAL = 5000; // Time between each call to jobStatus (milliseconds)

// Note: customerID and customerSecretKey should never be exposed to the enduser!
const CUSTOMER_ID = 'TODO_FILL_CUSTOMER_ID';
const CUSTOMER_SECRET_KEY = 'TODO_FILL_SECRET_KEY';
const logProgress = true; // Set to true if you want to see a console log of the execution progress


/*************************************/
/* Helper functions - server backend */
/*************************************/

// Generates sha256 key and returns the body for the FSA API request
function generateCommandLineWithSig(params) {
    var crypto = require('crypto');
    var hash = crypto.createHash('sha256');
    var commandLine = 'customerID=' + CUSTOMER_ID;
    for (var key in params) {
        if (params.hasOwnProperty(key)) {
            commandLine += `&${key}=${params[key]}`
        }
    }
    commandLine += "&finanda_key=" + CUSTOMER_SECRET_KEY;
    hash.update(commandLine);
    var sig = hash.digest('hex');
    var idx = commandLine.indexOf("&finanda_key=");
    return commandLine.substring(0, idx) + `&signature=${sig}`;
}

// Call to some API Function from the Finanda Smart Aggregation API
// action = initiateJob / continueJob / deleteJobResult / jobStatus / jobResults / institutesAvailability / getCredentialsSchema
// params = parameters for the action. For example, if action = initiateJob, you should send at least the the required parameters:
// instituteID, uid, pwd, vcA, vcB - in a JSON format
function FSACall (action, params) {
    if (logProgress) {
        console.log("Calling to " + action);
    }
    return new Promise( function (resolve, reject) {
        request.post({
            url: FSA_API + action,
            body: generateCommandLineWithSig(params)
        }, function(error, response, body) {
            if (!error && response.statusCode === 200) {
                // Everything went well. resolve for future use within the caller function
                var jsonResult = JSON.parse(body);
                resolve(jsonResult);
            }
            else if (!error)
            {
                // We got a response from FSA, but had some error (check return values from API Documentation)
                var jsonResult = JSON.parse(body);
                reject(jsonResult);
            }
            else
            {
                // We didn't get response from FSA. Probably a connectivity issue
                if (logProgress) {
                    console.log("Couldn't connect to FSA API");
                }
                reject({
                    success: false,
                    errorMessage: error.message
                });
            }
        });
    });
};

// Once the initialization of a job succeeded, check the job status every INTERVAL milliseconds for maximum of NUMBER_OF_ITERATIONS times
function checkJobStatusAndReturnJobResults(jobID) {
    return new Promise(function (resolveJobResults, rejectJobResults) {
        var status = undefined;
        var iterationsDone = Promise.reject();

        for (let i = 0; (i < NUMBER_OF_ITERATIONS || iterationsDone === Promise.resolve()); i++) {
            iterationsDone = iterationsDone.catch(function () {
                return new Promise(function (resolve, reject) {
                    setTimeout(function () {
                        FSACall("jobStatus", {jobID: jobID}).then(function (statusResult) {
                            status = statusResult.jobEntry.status;
                            if (logProgress) {
                                console.log("\t Iteration #" + i + ", jobStatus=" + status);
                            }
                            // resolve only when job is completed or failed
                            status === "completed" || status === "failure" ? resolve(statusResult) : reject(statusResult);
                        });
                    }, INTERVAL);
                });
            })
        }

        iterationsDone
            .then(function (statusResult) {
                // If the job status is completed, do something
                // For example: Call to JobResults and send back to enduser
                if (logProgress) {
                    console.log("\t Stopping iterations"); // status = completed
                }
                if (status === "completed") {
                    FSACall("jobResults", {jobID: jobID}).then(function (jobResults) {
                        resolveJobResults(jobResults);
                    }).catch(function (error) {
                        rejectJobResults(error);
                    });
                } else {
                    statusResult.success = false;
                    statusResult.errorMessage = statusResult.jobEntry.errorCode;
                    rejectJobResults(statusResult);// status = failure
                }
            })
            .catch(function (statusResult) {
                // If we got here it means that promise wasn't resolve, I.E., status != completed
                // We decide that if job isn't completed in the desired limitations,
                // it will be considered as an error for the client
                if (statusResult.success === true) {
                    statusResult.success = false;
                    statusResult.errorMessage = statusResult.jobEntry.status;
                    if (statusResult.errorMessage === "failure") {
                        statusResult.errorMessage = statusResult.jobEntry.errorCode;
                    }
                    if (logProgress) {
                        console.log("Failed to get jobResults."); // status != completed
                    }
                }
                rejectJobResults(statusResult);
            });
    });
}


/*************************************/
/* Actual server backend functions   */
/*************************************/

// Called every time the enduser visits your homepage (Called from UI)
// So you (the developer) can know what fields are required for the credentials (per each institute)
app.get('/callGetCredentialsSchema', function (req, res) {
    FSACall("getCredentialsSchema", req.query)
        .then(function (result)
        {
            res.send(result);
        })
        .catch(function (error)
        {
            res.send(error);
        });
});

// Called when the enduser clicks "submit" at the UI; This procedure will do the following:
//  0. (FSA CALL - institutesAvailability) check if desired institute is available
//  1. (FSA CALL - initiateJob) initiate job with enduser credentials, along with your private customerID and customerSecretKey
//  2. (FSA CALL - jobStatus) repeatedly check for job status until it's completed
//  3. (FSA CALL - jobResults) get and send results to enduser
//  4. (FSA CALL - deleteJobResult) delete stored result information about the job
//
// Note:
// If you are not familiar with "Promises chaining" concept,
// it's highly recommended for you to read about it before trying to understand the code below.
// You can read about it on:
// https://scotch.io/tutorials/javascript-promises-for-dummies
// https://javascript.info/promise-chaining
//
// In the code below you can notice that we call to FSACall function with different FSA API calls as a parameter.
// This function is an asynchronous operation, and in our case we would like to check institutesAvailability first,
// and only then call initiateJob -> checkJobStatusAndReturnJobResults -> deleteJobResult in a way that
// each subsequent operation starts when the previous operation succeeds.
// We accomplish this by creating a promise chain.
app.get('/runJobAndDisplayResults', function (req, res) {
    FSACall("institutesAvailability", {}) // (step 0) institutesAvailability API Call
        .then(function (result) {
            var instituteID = req.query["instituteID"];
            var isAvailable = undefined;
            if (instituteID === "0") { // Israeli-family Bank (example bank) is always available
                isAvailable = true;
            }
            else
            {
                var institutesArray = result.institutes;
                instituteAvailabilityObj = institutesArray.find(function (institute) {
                    return institute.instituteCode === instituteID;
                });
                isAvailable = instituteAvailabilityObj.available;
            }

            if (isAvailable) // desired institute is available, we can move on to steps 1-4
            {
                var resultsSent = false;
                var jobID = undefined;
                FSACall("initiateJob", req.query) // (step 1) initiateJob API Call
                    .then(function(initiateJobResult) {
                        if (logProgress) {
                            console.log("job successfully initiated");
                        }
                        jobID = initiateJobResult.jobID;
                        return checkJobStatusAndReturnJobResults(jobID); // (steps 2-3) jobStatus API Call (repeatedly) and jobResults API Call
                    })
                    .then(function(jobResults) {
                        if (logProgress) {
                            console.log("jobResults successfully fetched");
                        }
                        res.send(jobResults); // send jobResults to user
                        resultsSent = true;
                        return FSACall("deleteJobResult", {jobID: jobID})  // (step 4) deleteJobResult API Call
                    })
                    .then(function(deleteJobResult) {
                        if (logProgress) {
                            console.log("jobResults successfully deleted");
                        }
                    })
                    .catch(function (error) {
                        // handle all possible errors that can occur when performing steps 1-4
                        // we distinguish between 2 kinds of errors:
                        // those that can occur before or after jobResults sent back to enduser
                        if (!resultsSent) {
                            res.send(error); // We couldn't send the jobResults back to the enduser for some reason; notify the enduser
                        }
                        else if (logProgress){
                            console.log(error); // An error that we don't send back to the enduser; jobResults have been already sent
                        }
                    });
            }
            else // desired institute isn't available, throw an exception
            {
                throw({errorMessage: "Institute isn't available"});
            }
        })
        .catch(function (error) {
            if (logProgress) {
                console.log(error);
            }
            res.send(error);
        });
});

app.listen(PORT);
console.log('Reference project runs on port ' + PORT);