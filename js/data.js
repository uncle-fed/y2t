// This module should implement 'data-parser' that will process data coming from your custom YAML sources.
// The data source is the object named 'yaml' (available globally) where all the YAML-sourced data is held.
// The code here should parse the 'yaml' object and correctly populate the global tabular array named 'data'.

// Additionally, this module would be the right place to define custom event handlers for the main actions
// such as filtering, sorting and re-rendering table contents (in case you need to do something extra
// when such events occur). The custom events fired for the main table DOM object are:
//
//     initSrc, initData, initRender, postRender, preSort, postSort, preFilter, postFilter, applyState
//
// The init* event handlers are fired once only per life-time of the web-app.
//
// When one of those events is fired, some extra data may be passed through the event's 'detail' property.
// Wee code examples below that act as placeholders for your custom event handler implementation.

// Lastly, this is also the place for implementing and binding event handlers for custom HTML controls
// that you may decide to have in addition to the standard table.
// It is recommended to use the global 'state' object if your HTML controls affect how page looks like
// because this way the state of your custom controls will be stored in navigation history and URL.
// See code example below for working with 'state' object.


// Shared global objects to be used by this module ('state' is optional, only if you need to work with it).
import {state, yaml, data} from "./main.js";

// Some helper functions can also be sourced not to reinvent the wheel (see exports from 'common.js').
import {$, $$, updateView, saveState, escapeHtml} from "./common.js";


// In order to supply the names of your custom YAML data files, the 'initSrc' event will be triggered,
// In this event handler the only must-have action is to assign YAML file names to the 'yaml.files'
// property of the global 'yaml' object (imported from 'main.js' above).
//
// yaml.files can be assigned an object representing key/value pairs of source data files, for example:
// yaml.files = {myData: "my_file.yaml"};  means: "load file 'my_file.yaml' and parse it into 'yaml.myData'"
//
// Alternatively, yaml.files can be specified as a plain array of file names in which case the data keys
// would be 'auto-guessed' and derived from the file names, for example:
// yaml.files = ["my_file.yml", "https://data-source.com/files/remote.yaml"];
// The above will read 2 YAML files, one from local repo, one from remote URL and the data will be parsed
// into 'yaml.my_file' and into 'yaml.remote' (the key auto-guessing routine takes only the bare file name)
//
// As shown above, the file paths should be either relative to the 'yml' directory or contain full URLs
document.addEventListener("initSrc", function () {

    // This will allow loading data from 2 local YAML files: 'some_data.yml' and 'more_data.yml'.
    yaml.files = ["some_data.yml", "more_data.yml"];

    // Alternatively, identical result could be obtained with the following assignment:
    // yaml.files = {some_data: "some_data.yml", more_data: "more_data.yml"};

    // Of course it would be silly to offer 2 different ways of doing the same with more complex syntax,
    // so the 'object' way of setting the data sources exits for more complex cases such as:
    // yaml.files = {myData: "https://some-long-url.com/with/crazy-file-name-with-some-of-my-data.yaml"};
    // If you did it "the array way" (just listing the URL), the data from remote URL would be read into:
    // 'yaml.crazy-file-name-with-some-of-my-data'
    // but using the example here, your data would always end up in: 'yaml.myData'
});


// This is the main data parser that should convert raw YAML data into a standard 'data' array.
// The data should be sourced from the already available and fully populated 'yaml' object (exported from main.js).
// The destination is the (initially empty) 'data' array (also exported from main.js).
document.addEventListener("initData", function () {

    // Here you most certainly will have a loop (or even more likely a bunch of nested loops)
    // that go trough each item of your source data from the 'yaml' global object and
    // ultimately generate contents of the data[] array that is the base of the future table.

    // The 'yaml' object's keys are named exactly as the items of the yaml.files[] array,
    // so it would be usual to iterate some data in 'yaml.your-file-name' object/array
    // to obtain data for table cells/rows.

    // The rows should be stored in the array named 'data' where each array item is a JS object
    // describing a complete row. The objects will have properties named same way at the 'key' values
    // listed in the specs.yml file, representing table cells.

    // Each 'cell' is also an object with the following keys (most of them optional, as stated below):
    //
    //     .value     "actual value" (can be, and normally should be, the only item supplied)
    //     .html      "what should be displayed" in the table cell (may or may not look like the actual value)
    //     .match     "case insensitive string representation" for =, !=, ~, !~ matching
    //     .cmp       "integer OR hashed string representation" for <, > comparison and sorting
    //     .cmpMin    "min integer" for 'intrange' and 'ip' data types and < comparison only
    //     .cmpMax    "max integer" for 'intrange' and 'ip' data types and > comparison only
    //     .mask      "integer netmask representation" for 'ip' data type and @= comparison only
    //     .cssClass  "a string or array of strings representing custom CSS classes for the cell"
    //
    // ATTENTION: it is NOT expected that all of these representations should be supplied for every data cell
    // together with the raw value, since most of those representations can be automatically derived from the
    // .value property, unless special / unique logic is required.

    // One special/reserved cell key can be named '_row' to be able to pass properties affecting the entire row.
    // At the moment, the only supported property is cssClass, to apply custom CSS classes to the entire row.
    //
    // Most of the theory above is demonstrated in the code below that reads simple data
    //
    // Additionally, see very extensive comments to the function normalizeValue() from 'common.js'.

    (yaml.some_data || []).forEach(item => {

        const link = item.name + " <a href='http://abc.zxy/?q=" +
            encodeURIComponent(item.name) + "' target='zxy'>Link</a>";

        data.push({
            id:      item.id,
            label:   {value: item.name, html: link},
            src:     item.src,
            srcName: yaml.more_data[item.src],
            dst:     item.dst,
            dstName: yaml.more_data[item.dst],
            proto:   item.proto,
            ports:   item.ports,
            ver:     item.version,
            lastupd: item.timestamp,
            _row:    {cssClass: item.proto === "UDP" ? "highlight-row" : undefined}
        });
    });

}, false);


// Optional code that will be run once only, after the table was fully rendered on the initial page load.
// The best use of this is to initialize custom HTML elements that are disabled / hidden by default.
document.addEventListener("initRender", function () {
    // Show table caption that is initially hidden via 'hidden' HTML attribute
    $("table caption").removeAttribute("hidden");
}, false);


// Optional code which will be triggered every time the table has been redrawn (due to filtering, sorting or navigation).
document.addEventListener("postRender", function (event) {
    // event.detail should contain object with information about table drawn.
    // Currently it has a single property .visibleRowsCount that indicates how many visible rows the table has.
    $("table caption span").innerHTML = event.detail.visibleRowsCount;

    // clear column highlighting if there was any before (see the postSort event handler below)
    $$("#data-table .sorted").forEach($el => $el.classList.remove("sorted"));

    // check if we need to highlight a particular column (see the postSort event handler below)
    if (highlightColumn > -1) {
        $$("#data-table thead th")[highlightColumn].classList.add("sorted");
        $$("#data-table tbody tr").forEach($tr => $$("td", $tr)[highlightColumn].classList.add("sorted"));
    }

}, false);


// Optional code which will be triggered just before data sorting starts
document.addEventListener("preSort", function (event) {
    // event.detail should contain object about the column on which sorting is to be performed.
    // Currently the event.detail properties are: {colIdx: ... , colKey: ... , order: ...}
    //
    // As a simple demo of this event handler we can display a message about sorting.
    $("#data-table caption output").innerHTML = escapeHtml(
        "Sorting by column " + (event.detail.colIdx + 1) + " [" + event.detail.colKey + "] as [" + event.detail.order + "]"
    );
}, false);


// Optional code which will be triggered right after data sorting has finished (but table has not been rendered yet)
document.addEventListener("postSort", function (event) {
    // event.detail should contain object about the column on which sorting was performed.
    // Currently the event.detail properties are: {colIdx: ... , colKey: ... , order: ...}.
    //
    // As a demo, we can use this information to highlight the sorted column with thick border around whole column.
    // The most correct way would be manipulating CSS stylesheets directly with JavaScript,
    // instead of applying a 'highlighted' class to each cell in a column.
    // However, for the sake of demo-only, we do the 'bad thing': loop through every visible table row
    // and apply relevant class to a specific cell to make the whole column look highlighted.
    // We cannot do it in this event handler, because when this event is triggered
    // the table cells are not yet drawn, i.e., they don't exist in DOM, so there is nothing to loop through yet.
    // Instead, we'll just memorize the column ID in a global variable and deal with it in the postRender handler.
    highlightColumn = event.detail.colIdx;
}, false);


// Optional code which will be triggered just before data filtering starts
document.addEventListener("preFilter", function () {
    // Start measuring how long filtering takes.
    filterTimer = performance.now();
}, false);


// Optional code which will be triggered right after data filtering has finished (but table has not been rendered yet)
document.addEventListener("postFilter", function () {
    // Display how long filtering took in the table caption area reserved for this purpose.
    $("#data-table caption output").innerHTML = "Filtering took " + String(performance.now() - filterTimer) + " ms";
}, false);


// Optional code which will be triggered when all filtering is cleared (but table has not been rendered yet)
document.addEventListener("clearFilter", function () {
    // As a simple showcase, we can simply remove info text in the table caption.
    $("#data-table caption output").innerHTML = "";
}, false);


// Optional code which will be triggered every time the global 'state' is being applied to data.
// State can be restored either from URL fragment identifier (the part after the # sign) during initial page load or
// from the previously stored state in browser history, when the user presses back/forward navigation buttons.
// Either way, the code here should be looking for actual state in the global 'state' object.
// The table is NOT rendered yet at this stage but all the data in the global 'data' array is ready for rendering.
document.addEventListener("applyState", function () {
    // Change the HTML checkbox state according to 'state' object and the hide or show links accordingly.
    $("input[name=show-hide-links]").checked = !!state.showLinks;
    showHideLinks(state.showLinks);
    // Restore column highlighting in case some sorting order is in effect
    highlightColumn = state.sort ? yaml.specs.table.findIndex(column => column.key === state.sort) : -1;
}, false);


// --------- The rest of the code below is for extra showcase purpose ------------------------------------
// --------- The code below is not required in a fresh project at all! -----------------------------------


// timer variable to measure filtering performance
let filterTimer = 0;
let highlightColumn = -1;


// Function that shows and hides links in the table.
// Will be triggered either on page load or when clicking on checkbox
function showHideLinks(showLinks) {
    if (showLinks) {
        $("#data-table").classList.remove("hide-links");
    } else {
        $("#data-table").classList.add("hide-links");
    }
}


// Inject some additional HTML into the page for showcasing some of the custom behaviours defined above.
// Usually you should simply edit index.html instead and put your custom HTML controls there.
// It's done this way here to avoid polluting index.html (it should serve as a 'clean template' for new projects).

// Add a caption element to the table and hide it initially.
const $caption = document.createElement("caption");
$caption.innerHTML = "Rows count: <span></span><output></output>";
$caption.setAttribute("hidden", "");
$("#data-table").insertBefore($caption, $("#data-table thead"));

// Similarly to the above, inject a custom HTML <label> with a checkbox in it.
const $label1 = document.createElement("label");
$label1.innerHTML = "Show/hide HTML Links<input name=\"show-hide-links\" type=\"checkbox\" />";
$("body").insertBefore($label1, $("#data-table")).classList.add("show-hide-links");

// Add behavior to the checkbox that was just inserted above.
$("input[name=show-hide-links]").addEventListener("click", function (event) {
    showHideLinks(event.target.checked);
    saveState({showLinks: event.target.checked ? "true" : undefined});
});

// Add 3 buttons that will switch between different 'views' of the table (views are defined in 'specs.yml')
const $label2 = document.createElement("label");
$label2.innerHTML = "Select Table View<button value=\"full\">Show Everything</button>" +
    "<button value=\"partial\">Show Most</button><button value=\"minimal\">Show Minimum</button>";
$("body").insertBefore($label2, $label1).classList.add("view-selector");


// Add behaviour to the three buttons that were just inserted above.
// The key function call is 'updateView()' which will redraw table that matches a certain view from 'specs.yml'
$$(".view-selector button").forEach(el => el.addEventListener("click", (event) => {
    const oldSelected = $(".view-selector button.selected");
    if (oldSelected) {
        oldSelected.classList.remove("selected");
    }
    event.target.classList.add("selected");
    updateView(event.target.value);
}));

// Add 2nd 'postRender' custom event handler (there is already one defined above).
// This one will highlight the current view button on the initial page load
document.addEventListener("postRender", function () {
    const button = $(".view-selector button.selected");
    if (button && button.value !== state.view) {
        button.classList.remove("selected");
    }
    const newButton = $(".view-selector button[value='" + (state.view || "full") + "']");
    if (newButton) {
        newButton.classList.add("selected");
    }
}, false);
