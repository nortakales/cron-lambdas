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

    const apiKey = 'PUT_API_KEY_HERE_IN_BROWSER_DO_NOT_COMMIT';

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
            Tracked <a href="https://2sc4ccorf3.execute-api.us-west-2.amazonaws.com/prod?operation=DELETE&table=products&hashKeyName=title&hashKey=${encodeURIComponent(data.title)}&apiKey=${apiKey}">Remove</a>
            </div>
        `.trim());
    }

    function getTitle() {
        let productName = $('h1[data-test="product-overview-name"]')
            .text()
            .replace(/[^\x20-\x7E]/g, "")
            .replace(/\s+/g, " ");
        // <meta property="product:retailer_item_id" content="75429"/>
        let productNumber = $('meta[property="product:retailer_item_id"]').attr('content');
        return `LEGO ${productNumber} - ${productName}`;
    }

    function showNotTrackedUI() {
        let title = encodeURIComponent(getTitle());
        let encodedUrlKey = encodeURIComponent(urlKey);
        let website = 'LEGO';
        $('body').prepend(`
            <div style="z-index:999;position:absolute;background-color:#dc7b72;">
            NOT tracked. <a href="https://2sc4ccorf3.execute-api.us-west-2.amazonaws.com/prod?operation=PUT&table=products&a1=title&a2=${title}&a3=urlKey&a4=${encodedUrlKey}&a5=website&a6=${website}&apiKey=${apiKey}">Add</a>
            </div>
        `.trim());
    }

    $(document).ready(function() {
        let encodedUrlKey = encodeURIComponent(urlKey);
        GM_xmlhttpRequest({
            method: "GET",
            url: `https://2sc4ccorf3.execute-api.us-west-2.amazonaws.com/prod?operation=QUERY&table=products&indexName=urlKey-index&hashKeyName=urlKey&hashKey=${encodedUrlKey}&rangeKeyName=website&rangeKey=LEGO&apiKey=${apiKey}`,
            onload: showUI,
            onrror: logError,
            ontimeout: logError
        });
    });

})();