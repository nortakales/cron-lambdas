// ==UserScript==
// @name         LEGO Product Tracker
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  LEGO Product Tracker
// @match        https://www.lego.com/en-us/product/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=lego.com
// @grant        GM_xmlhttpRequest
// @connect      2sc4ccorf3.execute-api.us-west-2.amazonaws.com
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// ==/UserScript==

(function () {
    'use strict';

    const apiKey = 'PUT_API_KEY_HERE_IN_BROWSER_DO_NOT_COMMIT';

    const regex = /lego\.com\/en-us\/product\/([a-z0-9\-]+)/;
    const url = window.location.href;
    const match = regex.exec(url);
    const urlKey = match[1];
    console.log(urlKey);

    function showUI(response) {
        console.log(response.responseText);
        const data = JSON.parse(response.responseText)[0];
        if (data) {
            showTrackedUI(data);
        } else {
            GM_xmlhttpRequest({
                method: "GET",
                url: `https://script.google.com/macros/s/AKfycbw_9NdfUQXeLjLxXJMevOY2NI-FFryTdeVCHsuhhQn8/dev?setNumber=${getSetNumber()}`,
                onload: showFinalUI,
                onrror: showErrorUI,
                ontimeout: showErrorUI
            });
        }
    }

    function showFinalUI(response) {
        console.log(response.responseText);
        const data = JSON.parse(response.responseText);
        if (data.owned) {
            showOwnedUI();
        } else {
            showNotTrackedUI();
        }
    }

    function showLoadingUI() {
        $('body').prepend(`
            <div style="z-index:999;position:absolute;background-color:grey;" id="product-tracker-loading-element">
                Loading...
            </div>
        `.trim());
    }

    function showErrorUI() {
        console.log("Encountered error in AJAX request");
        $('body').prepend(`
            <div style="z-index:999;position:absolute;background-color:red;" id="product-tracker-loading-element">
                ERROR
            </div>
        `.trim());
        hideLoadingElement();
    }

    function showTrackedUI(data) {
        $('body').prepend(`
            <div style="z-index:999;position:absolute;background-color:#84a246;">
                Tracked <a href="https://2sc4ccorf3.execute-api.us-west-2.amazonaws.com/prod?operation=DELETE&table=products&hashKeyName=title&hashKey=${encodeURIComponent(data.title)}&apiKey=${apiKey}">Remove</a>
            </div>
        `.trim());
        hideLoadingElement();
    }

    function showOwnedUI() {
        $('body').prepend(`
            <div style="z-index:999;position:absolute;background-color:#5092ff;">
                Owned
            </div>
        `.trim());
        hideLoadingElement();
    }

    // <meta property="product:retailer_item_id" content="75429"/>

    function showNotTrackedUI() {
        let title = encodeURIComponent(getTitle());
        let encodedUrlKey = encodeURIComponent(urlKey);
        let website = 'LEGO';
        $('body').prepend(`
            <div style="z-index:999;position:absolute;background-color:#dc7b72;">
                NOT tracked. <a href="https://2sc4ccorf3.execute-api.us-west-2.amazonaws.com/prod?operation=PUT&table=products&a1=title&a2=${title}&a3=urlKey&a4=${encodedUrlKey}&a5=website&a6=${website}&apiKey=${apiKey}">Add</a>
            </div>
        `.trim());
        hideLoadingElement();
    }

    function hideLoadingElement() {
        $('#product-tracker-loading-element').hide();
    }

    function getTitle() {
        let productName = $('h1[data-test="product-overview-name"]')
            .text()
            .replace(/[^\x20-\x7E]/g, "")
            .replace(/\s+/g, " ");
        let productNumber = getSetNumber();
        return `LEGO ${productNumber} - ${productName}`;
    }

    function getSetNumber() {
        return $('meta[property="product:retailer_item_id"]').attr('content');
    }

    $(document).ready(function () {
        showLoadingUI();
        let encodedUrlKey = encodeURIComponent(urlKey);
        GM_xmlhttpRequest({
            method: "GET",
            url: `https://2sc4ccorf3.execute-api.us-west-2.amazonaws.com/prod?operation=QUERY&table=products&indexName=urlKey-index&hashKeyName=urlKey&hashKey=${encodedUrlKey}&rangeKeyName=website&rangeKey=LEGO&apiKey=${apiKey}`,
            onload: showUI,
            onrror: showErrorUI,
            ontimeout: showErrorUI
        });
    });

})();