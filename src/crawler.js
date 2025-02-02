const Apify = require('apify');
const Promise = require('bluebird');

/**
 * This is default pageFunction. It can be overridden using pageFunction on input.
 * It can return single object or array of object which will be save to index.
 * @param page - Reference to the Puppeteer Page
 * @param request - Apify.Request object
 * @param selectors - Selectors from input.selectors
 * @param Apify - Reference to the Apify SDK
 */
const defaultPageFunction = async ({ page, request, selectors, Apify }) => {
    const result = {
        url: request.url,
        '#debug': Apify.utils.createRequestDebugInfo(request),
    };
    const getSelectorsHTMLContent = (selectors = []) => {
        const result = {};
        Object.keys(selectors).forEach((key) => {
            const selector = selectors[key];
            const elements = $(selector);
            if (elements.length) result[key] = elements.map(function() {return $(this).html()}).toArray().join(' ');
            // NOTE: In some case e.g meta tags, we need to get content of element
            if (elements.length && !result[key]) result[key] = $(selector).attr('content');
        });
        return result;
    };
    const selectorsHTML = await page.evaluate(getSelectorsHTMLContent, selectors);
    Object.keys(selectorsHTML).forEach((key) => {
        result[key] = Apify.utils.htmlToText(selectorsHTML[key]).substring(0, 9500);
    });
    return result;
};

const omitSearchParams = (req) => {
    const urlWithoutParams = req.url.split('?')[0];
    req.url = urlWithoutParams;
    req.uniqueKey = urlWithoutParams;
    return req;
};

const setUpCrawler = async (input) => {
    const { startUrls, additionalPageAttrs,
        omitSearchParamsFromUrl, clickableElements, pageFunction,
        keepUrlFragment, waitForElement, pseudoUrls = [], crawlerName, requiredAttributes, disableCrawlerCascade, listOfUrls } = input;

    // Transform selectors into key-value object
    let selectors = {};
    if (input.selectors && Array.isArray(input.selectors)) {
        input.selectors.forEach(selector => (selectors[selector.key] = selector.value))
    }

    const requestQueue = await Apify.openRequestQueue();
    if (listOfUrls && listOfUrls.length) {
        await Promise.map(listOfUrls, request => requestQueue.addRequest(request), { concurrency: 3 });
        if (pseudoUrls.length === 0) {
            listOfUrls.forEach(request => {
                pseudoUrls.push({ purl: `${request.url}[.*]`})
            });
        }
    } else {
        await Promise.map(startUrls, request => requestQueue.addRequest(request), { concurrency: 3 });
        if (pseudoUrls.length === 0) {
            startUrls.forEach(request => {
                pseudoUrls.push({ purl: `${request.url}[.*]`})
            });
        }
    }
    
    const pseudoUrlsUpdated = pseudoUrls.map(request => new Apify.PseudoUrl(request.purl));

    const crawler = new Apify.PuppeteerCrawler({
        requestQueue,
        handlePageFunction: async ({ request, page }) => {
            console.log(`Processing ${request.url}`);
            await Apify.utils.puppeteer.injectJQuery(page);

            // Wait for element if needed
            if (waitForElement) await page.waitForSelector(waitForElement);

            // Get results from the page
            let results;
            const pageFunctionContext = { page, request, selectors, requiredAttributes, Apify, requestQueue };

            if (pageFunction) {
                pageFunctionParsed = (new Function(`return ${pageFunction}`))();
                results = await pageFunctionParsed(pageFunctionContext);
            } else {
                results = await defaultPageFunction(pageFunctionContext);
            }

            // Validate results and push to dataset
            const type = typeof results;
            if (type !== 'object') {
                throw new Error(`Page function must return Object or Array, it returned ${type}.`);
            }
            if (!Array.isArray(results)) results = [results];
            const cleanResults = results.filter((result) => {
                const requiredAttributesInResult = requiredAttributes && requiredAttributes.length
                    ? requiredAttributes
                    : Object.keys(selectors);
                const isAllSelectorsIncluded = selectors ? !requiredAttributesInResult.some(key => !result[key]) : true;
                const isResultValid = result.url && isAllSelectorsIncluded;
                return isResultValid;
            }).map((result) => {
                return {
                    ...result,
                    ...additionalPageAttrs,
                    crawledBy: crawlerName,
                    crawledAt: new Date,
                }
            });

            await Apify.pushData(cleanResults);

            if (!disableCrawlerCascade) {
                // Enqueue following links
                const enqueueLinksOpts = {
                    page,
                    selector: clickableElements || 'a',
                    pseudoUrls: pseudoUrlsUpdated,
                    requestQueue,
                };
                if (omitSearchParamsFromUrl) enqueueLinksOpts.transformRequestFunction = omitSearchParams;
                if (keepUrlFragment) {
                    enqueueLinksOpts.transformRequestFunction = (request) => {
                        request.keepUrlFragment = true;
                        return request;
                    };
                }
                await Apify.utils.enqueueLinks(enqueueLinksOpts);
            }
        },
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed too many times`);
            await Apify.pushData({
                '#debug': Apify.utils.createRequestDebugInfo(request),
            });
        },
    });

    return crawler;
};

module.exports = { setUpCrawler };
