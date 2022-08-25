// ==UserScript==
// @name         LEGO Product Tracker
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  LEGO Product Tracker
// @match        https://www.lego.com/en-us/product/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=lego.com
// @grant        GM_xmlhttpRequest
// @connect      2sc4ccorf3.execute-api.us-west-2.amazonaws.com
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// ==/UserScript==

(function() {
    'use strict';

    const regex = /lego\.com\/en-us\/product\/([a-z0-9\-]+)/;
    const url = window.location.href;
    const match = regex.exec(url);
    const urlKey = match[1];
    console.log(urlKey);

    function logError() {
        console.log("Encountered error in AJAX request");
    }

    function showUI(response) {
        console.log(response.responseText);
        const data = JSON.parse(response.responseText)[0];
        if (data) {
            showTrackingUI(data);
        } else {
            showNotTrackedUI();
        }
    }

    function showTrackingUI(data) {
        $('body').prepend(`
            <div style="z-index:999;position:absolute;background-color:#84a246;">
            Tracked <a href="https://2sc4ccorf3.execute-api.us-west-2.amazonaws.com/prod?operation=DELETE&table=products&hashKeyName=title&hashKey=${data.title}">Remove</a>
            </div>
        `.trim());
    }

    function showNotTrackedUI() {
        $('body').prepend(`
            <div style="z-index:999;position:absolute;background-color:#dc7b72;">
            NOT tracked.
            </div>
        `.trim());
    }

    GM_xmlhttpRequest({
        method: "GET",
        url: `https://2sc4ccorf3.execute-api.us-west-2.amazonaws.com/prod?operation=QUERY&table=products&indexName=urlKey-index&hashKeyName=urlKey&hashKey=${urlKey}&rangeKeyName=website&rangeKey=LEGO`,
        onload: showUI,
        onrror: logError,
        ontimeout: logError
    });

})();