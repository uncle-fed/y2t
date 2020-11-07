# YML-to-TABLE

## General Information

This repository serves as a template to be built upon.  
It contains a fully working demo of a one-page-web-app that can be consumed as a web site via GitHub Pages.  
The demo can be seen at the following URL: <https://uncle-fed.github.io/y2t/>  

The main reason why this exists is to enable easy and flexible way of working with YAML data as HTML tables.  
Sometimes you need to visualise data that is automatically fetched from some place and stored as YAML in GitHub.  
This framework allows not only display it but also allows interactive filtering, highlighting, sorting and exporting.  
It does not require a special web-site to be set up additionally because GitHub-pages can be used instead.

## Requirements

The usage of this framework in your project requires at least a tiny bit of additional JS programming.  
Custom YAML data can have any structure so you will need to provide at least a minimal 'data loader' function.  
The framework does not have any external dependencies on other JS libraries, except for [JS-YAML](https://github.com/nodeca/js-yaml).  
Y2T is written in ES6 and uses many modern features of the current browsers, older browsers are not supported.

## Specifics for new projects

The demo above displays the source data from the `*_data.yml` files found int `yml` directory.  
The rules about how data should be presented as a table are listed in `yml/specs.yml`.  
Custom JS code that tells the framework how to treat the demo YAML data can be found in `js/data.js`.

Once you clone this repository, you should mainly be concerned with three things:

- The complete contents of the `yml` directory will be different in your project (the specs and the data is _yours_).
- You should rewrite `js/data.js` for your project needs using the guidance from the provided demo `js/data.js`.
- It is fully OK to mess with `css/custom.css` (and, if you must, also with `css/default.css`) for the "look and feel".

Most useful information (close-to-documentation) is given in the sample files `yml/specs.yml` and `js/data.js`.  
They also contain further pointers should you require deeper understanding about how things work under the hood.

## Disclaimer

This little framework is not supposed to be universal / super-advanced / feature rich library, not by a long shot.  
It addresses a very specific use case: serving YAML data as interactive HTML tables (using GitHub pages).  
There are hundreds of other features and ideas one could potentially bring into this, no doubt.  
But then again, there are probably hundreds of other JS libraries allowing you to work with structured data anyway.  
Please understand this and don't ask for new features or support unless something is really broken in the current implementation.  
I am publishing this on GitHub not to compete with other libraries but rather than a source of inspiration for others.  
If you cannot make this work for you, please look elsewhere as I cannot afford time for individual support.  
If you find it useful in your projects, I'd appreciate if you could give my effort some credit or attribution.
Thank you for understanding.
