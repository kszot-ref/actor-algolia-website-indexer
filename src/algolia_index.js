/**
 * Browses whole Algolia index and returns pages crawler by selected crawler.
 * @param index
 * @param crawledBy
 * @return {Promise<Array>}
 */
const browseAll = async (index, crawledBy) => {
    console.log("START BROWSE ALL");

    let items = [];
    try {
        const result = await index.browseObjects({
            query: "",
            filters: `crawledBy:${crawledBy}`,
            attributesForFaceting: [
                "crawledBy"
            ],
            batch: batch => {
                items = items.concat(batch);
            }
        });
        console.log(result)
        console.log("END BROWSE ALL");
        console.log(items);
        return items;
    } catch (e) {
        console.error(e);
        return []
    }
}

/**
 * Updates Algolia index regarding pagesDiff object.
 * @param index
 * @param pagesDiff
 * @return {Promise<void>}
 */
const update = async (index, pagesDiff) => {
    const pagesToAdd = Object.values(pagesDiff.pagesToAdd);
    if (pagesToAdd.length) {
        console.log(`Adding following pages to the index\n${pagesToAdd.map(page => page.url).join('\n')}`);
        await index.saveObjects(pagesToAdd, { autoGenerateObjectIDIfNotExist: true });
    }

    const pagesToUpdated = Object.values(pagesDiff.pagesToUpdate);
    if (pagesToUpdated.length) {
        console.log(`Updating following pages in the index\n${pagesToUpdated.map(page => page.url).join('\n')}`);
        await index.saveObjects(pagesToUpdated);
    }

    if (pagesDiff.pagesToRemove) {
        const pagesToRemove = Object.values(pagesDiff.pagesToRemove);
        if (pagesToRemove.length) {
            console.log(`Removing following pages in the index\n${pagesToRemove.map(page => page.url).join('\n')}`);
            await index.deleteObjects(pagesToRemove.map(item => item.objectID));
        }
    }
};

module.exports = {
    browseAll,
    update,
};
