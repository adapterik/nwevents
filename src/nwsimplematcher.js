// embedded NW.Dom.match() so basic event delegation works,
// accepts mixed id, tag, class simple selectors div#foo.bar
// accepts objects having properties that must match element
// overwritten when loading the nwmatcher.js selector engine

define([], function () {
    /* This variables are available in the object definition */
    var  Patterns = {
	'id': /#([^\.]+)/,
	'tagName': /^([^#\.]+)/,
	'className': /\.([^#]+)/,
	'all': /^[\.\-\#\w]+$/
    },
    References = {
	'parentNode': 1,
	'lastChild': 1,
	'firstChild': 1,
	'nextSibling': 1,
	'previousSibling': 1,
	'lastElementChild': 1,
	'firstElementChild': 1,
	'nextElementSibling': 1,
	'previousElementSibling': 1
    },
    // select Matches Selector API to use if available
    root = document.documentElement,
    NATIVE_MATCHES_SELECTOR =
	'matchesSelector' in root ? 'matchesSelector' :
	'oMatchesSelector' in root ? 'oMatchesSelector' :
	'msMatchesSelector' in root ? 'msMatchesSelector' :
	'mozMatchesSelector' in root ? 'mozMatchesSelector' :
	'webkitMatchesSelector' in root ? 'webkitMatchesSelector' : null,
    RE_SIMPLE_SELECTOR = RegExp('^(?:\\*|[.#]?-?[_a-zA-Z]{1}(?:[-\\w]|[^\\x00-\\xa0]|\\\\.)*)$');

    var Dom = Object.create({}, {
	version: {
	    value: 'match-1.0'
	},
	// use a simple selector match or a full
	// CSS3 selector engine if it is available
	match: {
	    value: function(element, selector) {
		var d, j, length, id, tagName, className,
		match, matched = false, results = [ ];
		
		d = element.ownerDocument || element;
		
		if (typeof selector === 'string') {
		    if (RE_SIMPLE_SELECTOR.test(selector)) {
			// use a simple selector match (id, tag, class)
			if (selector.match(Patterns.all)) {
			    match = selector.match(Patterns.tagName);
			    tagName = match ? match[1] : '*';
			    match = selector.match(Patterns.id);
			    id = match ? match[1] : null;
			    match = selector.match(Patterns.className);
			className = match ? match[1] : null;
			    if ((!id || id === element.id) &&
				(!tagName || tagName === '*' || (new RegExp(tagName, 'i')).test(element.nodeName)) &&
				(!className || (' ' + element.className.replace(/\s+/g, ' ') + ' ').indexOf(' ' + className + ' ') > -1)) {
				matched = true;
			    }
			}
		    } else if (NATIVE_MATCHES_SELECTOR) {
			// use native matchesSelector where available
			return element[NATIVE_MATCHES_SELECTOR](selector);
		    }
		    return matched;
		} else {
		    // a selector matcher object
		    if (typeof selector === 'object') {
			// match on property/values
			for (j in selector) {
			    matched = false;
			    if (j === 'className') {
				// handle special className matching
				if ((' ' + element.className.replace(/\s+/g, ' ') + ' ').indexOf(' ' + selector[j] + ' ') > -1) {
				    matched = true;
				}
			    } else if (j === 'nodeName' || j === 'tagName') {
				// handle upper/lower case tag names
				if (element[j].toLowerCase() === selector[j].toLowerCase()) {
				    matched = true;
				}
			    } else if (References[j]) {
				// handle matching nested objects references
				matched = Dom.match(element[j], selector[j]);
			    } else {
				// handle matching other properties
				if (element[j] === selector[j]) {
				    matched = true;
				}
			    }
			    results.push(matched);
			}
		    }
		}
		
		// boolean true/false
		return results.join('|').indexOf('false') < 0;
	    }
	}
    });

    return Dom;
});
