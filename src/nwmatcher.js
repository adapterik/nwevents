/*
 * Copyright (C) 2007-2008 Diego Perini
 * All rights reserved.
 *
 * nwmatcher.js - A fast selector engine not using XPath
 *
 * Author: Diego Perini <diego.perini at gmail com>
 * Version: 1.0beta
 * Created: 20070722
 * Release: 20080822
 *
 * License:
 *  http://javascript.nwbox.com/NWMatcher/MIT-LICENSE
 * Download:
 *  http://javascript.nwbox.com/NWMatcher/nwmatcher.js
 */

window.NW || (window.NW = {});

NW.Dom = function() {

  var version = '1.0beta',

  // selection functions returning collections
  compiledSelectors = { },

  // matching functions returning booleans
  compiledMatchers = { },

  // cached selection results
  cachedResults = {
    from: [ ],
    items: [ ]
  },

  // attribute names may be passed case insensitive
  // accepts chopped attributes like "class" and "for"
  camelProps = [
    'htmlFor','className','tabIndex','accessKey','maxLength',
    'readOnly','longDesc','frameBorder','isMap','useMap','noHref','noWrap',
    'colSpan','rowSpan','cellPadding','cellSpacing','marginWidth','marginHeight'
  ],

  // child pseudo selector (CSS3)
  child_pseudo = /\:(nth|first|last|only)\-/,
  // of-type pseudo selectors (CSS3)
  oftype_pseudo = /\-(of-type)/,

  // trim whitespaces
  TR = /^\s+|\s+$/g,

  // precompiled Regular Expressions
  Patterns = {
    // nth child pseudos
    npseudos: /^\:(nth-)?(first|last|only)?-?(child)?-?(of-type)?(\((?:even|odd|[^\)]*)\))?(.*)/,
    // simple pseudos
    spseudos: /^\:([\w]+)(\(([\x22\x27])?(.*?(\(.*?\))?[^(]*?)\3\))?(.*)/,
    // E > F
    children: /^\s*\>\s*(.*)/,
    // E + F
    adjacent: /^\s*\+\s*(.*)/,
    // E ~ F
    relative: /^\s*\~\s*(.*)/,
    // E F
    ancestor: /^(\s+)(.*)/,
    // attribute
    attribute: /^\[([-\w]*:?[-\w]+)\s*(?:([!^$*~|])?(\=)?\s*([\x22\x27])?([^\4]*?)\4|([^\4][^\]]*?))\](.*)/,
    // all
    all: /^\*(.*)/,
    // id
    id: /^\#([-\w]+)(.*)/,
    // tag
    tagName: /^([-\w]+)(.*)/,
    // class
    className: /^\.([-\w]+)(.*)/
  },

  // initial optimizations
  Optimizations = {
    // all elements
    all: /(^\*)$/,
    // single class, id, tag
    id: /^\#([-\w]+)$/,
    tagName: /^([\w]+)$/,
    className: /^\.([-\w]+)$/
  },

  // convert nodeList to array
  toArray =
    function(iterable) {
      var length = iterable.length, array = new Array(length);
      while (length--) {
        array[length] = iterable[length];
      }
      return array;
    },

  // compile a CSS3 string selector into
  // ad-hoc javascript matching function
  compileSelector =
    // @mode boolean true for select, false for match
    function(selector, source, mode) {

      var a, b, i,
          // building placeholders
          compare, match, param, test, type,
          attributeValue, attributePresence;

      while (selector) {

        // * match all
        if ((match = selector.match(Patterns.all))) {
          // on IE remove comment nodes to avoid this
          source = 'if(e.nodeType==1){' + source + '}';
        }
        // #Foo Id case sensitive
        else if ((match = selector.match(Patterns.id))) {
          // this is necessary because form elements using reserved words as id/name can overwrite form properties (ex. name="id")
          source = 'if(e.id&&e.id=="' + match[1] + '"||((a=e.getAttributeNode("id"))&&a.value=="' + match[1] + '")){' + source + '}';
        }
        // Foo Tag case insensitive
        else if ((match = selector.match(Patterns.tagName))) {
          source = 'if(e.nodeName.toLowerCase()=="' + match[1].toLowerCase() + '"){' + source + '}';
        }
        // .Foo Class case sensitive
        else if ((match = selector.match(Patterns.className))) {
          source = 'if(e.className&&((" "+e.className).replace(/\\s+/g," ") + " ").indexOf(" ' + match[1] + ' ")>-1){' + source + '}';
        }
        // [attr] [attr=value] [attr="value"] and !=, *=, ~=, |=, ^=, $=
        else if ((match = selector.match(Patterns.attribute))) {

          // fix common misCased attribute names
          compare = match[1];
          for (i = 0; i < camelProps.length; ++i) {
            if (camelProps[i].toLowerCase().indexOf(match[1]) == 0) {
              compare = camelProps[i];
              break;
            }
          }

          if (/\w+:\w+/.test(match[1])) {
            // XML namespaced attributes
            attributeValue = '(((a=e.getAttribute("' + match[1] + '",1))&&a)||"")';
          } else if ("|action|data|href|longdesc|lowsrc|src|".indexOf(match[1]) > -1) {
            // specific URI attributes
            attributeValue = '(((a=e.getAttribute("' + match[1] + '",2))&&a)||"")';
          } else {
            // others by property value
            attributeValue = '(e.' + compare + '||"")';
          }

          if (typeof document.fileSize != 'undefined') {
            // on IE check the "specified" property on the attribute node
            attributePresence = '((a=e.getAttributeNode("' + match[1] + '"))&&a.specified)';
          } else {
            attributePresence = 'e.hasAttribute("' + match[1] + '")';
          }

          // match[1] - attribute name
          // match[2] - operator type
          // match[3] - equal sign
          // match[4] - quotes
          // match[5] - value

          // no "*" operator in these conditionals
          // .match() will handle it by exclusion
          // for case insensitive matches use "|"
          source = 'if(' +
            // match attribute or property
            (match[2] && match[3] && match[5] && match[2] != '!' ?
              // replace possible whitespaces with space in properties values
              // and build a "-propval-" or " propval " string to exactly match
              (match[2] == '~' ? '(" "+' : (match[2] == '|' ? '("-"+' : '')) + attributeValue +
                (match[2] == '!' || match[2] == '~' ? '.replace(/\\s+/g," ")' : '') +
              (match[2] == '~' ? '+" ")' : (match[2] == '|' ? '+"-")' : '')) +
                // BEGIN: add an indexOf() or match() where it applies ( ! and ~ use indexOf)
                (match[2] == '!' || match[2] == '~' ? '.indexOf("' : '.match(/') +
                  // build the content of the indexOf search or the match
                  (match[2] == '^' ? '^' : match[2] == '~' ? ' ' : match[2] == '|' ? '-' : '') +
                    match[5] +
                  (match[2] == '$' ? '$' : match[2] == '~' ? ' ' : match[2] == '|' ? '-' : '') +
                // END: close the indexOf or match()
                (match[2] == '!' || match[2] == '~' ? '")>-1' : (match[2] == '|' ? '/i' : '/') + ')') :
              // add rigth side of comparison when no indexOf / match
              // when we have to exactly match or not a value ( ! or = )
              (match[3] && match[5] ?
                attributeValue + (match[2] == '!' ? '!' : '=') + '="' + match[5] + '"' :
                  // or just check for attribute presence
                  attributePresence)) +
          '){' + source + '}';
        }
        // E + F (F adiacent sibling of E)
        else if ((match = selector.match(Patterns.adjacent))) {
          source = 'while(e.previousSibling){e=e.previousSibling;if(e.nodeType==1){' + source + 'break;}}';
        }
        // E ~ F (F relative sibling of E)
        else if ((match = selector.match(Patterns.relative))) {
          source = 'while(e.previousSibling){e=e.previousSibling;if(e.nodeType==1){' + source.replace(/\}$/, 'break;}') + '}}';
        }
        // E > F (F children of E)
        else if ((match = selector.match(Patterns.children))) {
          source = 'while(e.parentNode.nodeType==1){e=e.parentNode;' + source + 'break;}';
        }
        // E F (E ancestor of F)
        else if ((match = selector.match(Patterns.ancestor))) {
          source = 'while(e.parentNode.nodeType==1){e=e.parentNode;' + source.replace(/\}$/, 'break;}') + '}';
        }
        // :first-child, :last-child, :only-child,
        // :first-child-of-type, :last-child-of-type, :only-child-of-type,
        // :nth-child(), :nth-last-child(), :nth-of-type(), :nth-last-of-type()
        else if ((match = selector.match(Patterns.npseudos)) && (match[2] || match[5])) {
          // snapshot collection type to use Twin or Child
          type = match[4] == 'of-type' ? 'Twin' : 'Child';

          if (match[5]) {
            // remove the ( ) grabbed above
            match[5] = match[5].replace(/\(|\)/g, '');

            if (match[5] == 'even') {
              a = 2;
              b = 0;
            } else if (match[5] == 'odd') {
              a = 2;
              b = 1;
            } else {
              // assumes correct "an+b" format
              a = match[5].match(/^-/) ? -1 : match[5].match(/^n/) ? 1 : 0;
              a = a || ((param = match[5].match(/(-?\d{1,})n/)) ? parseInt(param[1], 10) : 0);
              b = 0 || ((param = match[5].match(/(-?\d{1,})$/)) ? parseInt(param[1], 10) : 0);
            }

            compare =
              (match[2] == 'last' ?
                '(s.' + type + 'Lengths[s.' + type + 'Parents[u]]' +
                (match[4] == 'of-type' ? '[e.nodeName.toUpperCase()]' : '') + '-' + (b - 1) + ')' : b);

            // handle 4 cases: 1 (nth) x 4 (child, of-type, last-child, last-of-type)
            test = match[5] == 'even' ||
              match[5] == 'odd' ||
              a > Math.abs(b) ?
                ('%' + a + '==' + b) :
              a < 0 ?
                '<=' + compare :
              a > 0 ?
                '>=' + compare :
              a == 0 ?
                '==' + compare :
                '';

            if (mode) {
              // add function for select method (mode=true)
              // requires prebuilt array get[Childs|Twins]
              source = 'u=s.getIndex(e)+1;' +
                'if(s.' + type + 'Indexes[u]' + test + '){' + source + '}';
            } else {
              // add function for "match" method (mode=false)
              // this will not be in a loop, this is faster
              // for "match" but slower for "select" and it
              // also does not require prebuilt node array
              source = 'if((n=e)){' +
                'u=1' + (match[4] == 'of-type' ? ',t=e.nodeName;' : ';') +
                'while((n=n.' + (match[2] == 'last' ? 'next' : 'previous') + 'Sibling)){' +
                  'if(n.node' + (match[4] == 'of-type' ? 'Name==t' : 'Type==1') + '){++u;}' +
                '}' +
                'if(u' + test + '){' + source + '}' +
              '}';
            }
          } else {
            // handle 6 cases: 3 (first, last, only) x 1 (child) x 2 (-of-type)
            compare =
              's.' + type + 'Lengths[s.' + type + 'Parents[u]]' +
              (match[4] == 'of-type' ? '[e.nodeName.toUpperCase()]' : '');

            if (mode) {
              // add function for select method (mode=true)
              source = 'u=s.getIndex(e)+1;' +
                'if(' +
                  (match[2] == 'first' ?
                    's.' + type + 'Indexes[u]==1' :
                    match[2] == 'only' ?
                      compare + '==1' :
                      match[2] == 'last' ?
                        's.' + type + 'Indexes[u]==' + compare : '') +
                '){' + source + '}';
            } else {
              // add function for match method (mode=false)
              source = 'if((n=e)){' +
                (match[4] ? 't=e.nodeName;' : '') +
                'while((n=n.' + (match[2] == 'first' ? 'previous' : 'next') + 'Sibling)&&' +
                  'n.node' + (match[4] ? 'Name!=t' : 'Type!=1') + ');' +
                'if(!n&&(n=e)){' +
                  (match[2] == 'first' || match[2] == 'last' ?
                    '{' + source + '}' :
                    'while((n=n.' + (match[2] == 'first' ? 'next' : 'previous') + 'Sibling)&&' +
                        'n.node' + (match[4] ? 'Name!=t' : 'Type!=1') + ');' +
                    'if(!n){' + source + '}') +
                '}' +
              '}';
            }
          }
        }
        // CSS3 :not, :root, :empty, :contains, :enabled, :disabled, :checked, :target
        // CSS2 :active, :focus, :hover (no way yet)
        // CSS1 :link, :visited
        else if ((match = selector.match(Patterns.spseudos))) {
          switch (match[1]) {
            // CSS3 part of structural pseudo-classes
            case 'not':
              source = compileSelector(match[2].replace(/\((.*)\)/, '$1'), source, mode).replace(/if([^\{]+)/, 'if(!$1)');
              break;
            case 'root':
              source = 'if(e==(e.ownerDocument||e.document||e).documentElement){' + source + '}';
              break;
            case 'empty':
              // IE does not support empty text nodes, HTML white spaces and CRLF are not in the DOM
              source = 'if(/^\\s*$/.test(e.innerHTML)&&!/\\r|\\n/.test(e.innerHTML)){' + source + '}';
              break;
            case 'contains':
              source = 'if((e.textContent||e.innerText||"").indexOf("' + match[2].replace(/\(|\)/g, '') + '")!=-1){' + source + '}';
              break;
            // CSS3 part of UI element states
            case 'enabled':
              source = 'if(e.type&&e.type!="hidden"&&!e.disabled){' + source + '}';
              break;
            case 'disabled':
              source = 'if(e.type&&e.type!="hidden"&&e.disabled){' + source + '}';
              break;
            case 'checked':
              source = 'if(e.type&&e.type!="hidden"&&e.checked){' + source + '}';
              break;
            // CSS3 target element
            case 'target':
              source = 'if(e.id==location.href.match(/#([_-\w]+)$/)[1]){' + source + '}';
              break;
            // CSS1 & CSS2 link
            case 'link':
              source = 'if(e.nodeName.toUpperCase()=="A"&&e.href){' + source + '}';
              break;
            case 'visited':
              source = 'if(e.nodeName.toUpperCase()=="A"&&e.visited){' + source + '}';
              break;
            // CSS1 & CSS2 user action
            case 'active':
              // IE & FF3 have native method, others may have it emulated,
              // this may be done in the event manager setting activeElement
              source = 'var d=(e.ownerDocument||e.document);' +
                       'if(d.activeElement&&e===d.activeElement){' + source + '}';
              break;
            case 'hover':
              // IE & FF3 have native method, other browser may achieve a similar effect
              // by delegating mouseover/mouseout handling to document/documentElement
              source = 'var d=(e.ownerDocument||e.document);' +
                       'if(d.hoverElement&&e===d.hoverElement){' + source + '}';
              break;
            case 'focus':
              // IE, FF3 have native method, others may have it emulated,
              // this may be done in the event manager setting focusElement
              source = 'var d=(e.ownerDocument||e.document);' +
                       'if(e.type&&e.type!="hidden"&&' +
                         '((e.hasFocus&&e.hasFocus())||' +
                         '(d.focusElement&&e===d.focusElement))){' + source + '}';
              break;
            default:
              break;
          }
        }
        else throw new Error('NW.Dom.compileSelector: syntax error, unknown selector rule "' + selector + '"');

        selector = match[match.length - 1];
      }

      return source;
    },

  // compile a comma separated group of selector
  // @mode boolean true for select, false for match
  compileGroup =
    function(selector, mode) {
      var i = 0, source = '', token, cachedTokens = {}, parts = selector.split(',');
      // for each selector in the group
      for ( ; i < parts.length; ++i) {
        token = parts[i].replace(TR, '');
        // if we have a selector string
        if (token && token.length > 0) {
          // avoid repeating the same functions
          if (!cachedTokens[token]) {
            cachedTokens[token] = token;
            // insert corresponding mode function
            if (mode) {
              source += compileSelector(token, 'r[r.length]=c[k];', mode);
            } else {
              source += compileSelector(token, 'return true;', mode);
            }
          }
        }
      }
      if (mode) {
        // for select method
        return new Function('c,s', 'var k=-1,e,r=[],n,j,u,t,a;while((e=c[++k])){' + source + '}return r;');
      } else {
        // for match method
        return new Function('e', 'var n,u,a;' + source  + 'return false;');
      }
    },

  // snapshot of elements contained in rootElement
  // also contains maps to make nth lookups faster
  // updated when the elements in the DOM change
  Snapshot = {
    Elements: [],
    TwinIndexes: [],
    TwinLengths: [],
    TwinParents: [],
    ChildIndexes: [],
    ChildLengths: [],
    ChildParents: [],
    hasElements: false,
    hasTwinIndexes: false,
    hasChildIndexes: false,
    getIndex:
      function(e) {
        return getIndex(this.Elements, e);
      }
  },

  // get element index in a node array
  getIndex =
    function(array, element) {
      // IE only (too slow in opera)
      if (typeof document.fileSize != 'undefined') {
        getIndex = function(array, element) {
          return element.sourceIndex || -1;
        };
      // gecko, webkit have native array indexOf
      } else if (array.indexOf) {
        getIndex = function(array, element) {
          return array.indexOf(element);
        };
      // other browsers will use this replacement
      } else {
        getIndex = function(array, element) {
          var i = array.length;
          while (--i >= 0) {
            if (element == array[i]) {
              break;
            }
          }
          return i;
        };
      }
      return getIndex(array, element);
    },

  // build a twin index map by tag position
  getTwins =
    function(f, c) {
      var k = 0, e, r, p, s, x,
        h = [f], b = [0], i = [0], l = [0];
      while ((e = c[k++])) {
        h[k] = e;
        l[k] = 0;
        p = e.parentNode;
        r = e.nodeName;
        if (s != p) {
          x = getIndex(h, s = p);
        }
        b[k] = x;
        l[x] = l[x] || {};
        l[x][r] = l[x][r] || 0;
        i[k] = ++l[x][r];
      }
      Snapshot.TwinParents = b;
      Snapshot.TwinIndexes = i;
      Snapshot.TwinLengths = l;
    },

  // build a child index map by child position
  getChilds =
    function(f, c) {
      var  k = 0, e, p, s, x,
        h = [f], b = [0], i = [0], l = [0];
      while ((e = c[k++])) {
        h[k] = e;
        l[k] = 0;
        p = e.parentNode;
        if (s != p) {
          x = getIndex(h, s = p);
        }
        b[k] = x;
        i[k] = ++l[x];
      }
      Snapshot.ChildParents = b;
      Snapshot.ChildIndexes = i;
      Snapshot.ChildLengths = l;
    },

  // set this to true to always enable or
  // switch manually using setCache(true)
  cachingEnabled = false,

  // enable caching system
  // @d optional document context
  setCache =
    function(enable, d) {
      expireCache();
      d || (d = document);
      if (!cachingEnabled && enable) {
        // FireFox/Opera/Safari/KHTML support both Mutation Events
        d.addEventListener('DOMNodeInserted', expireCache, false);
        d.addEventListener('DOMNodeRemoved', expireCache, false);
        cachingEnabled = true;
      } else if (cachingEnabled) {
        d.removeEventListener('DOMNodeInserted', expireCache, false);
        d.removeEventListener('DOMNodeRemoved', expireCache, false);
        cachingEnabled = false;
      }
    },

  // expose the private method
  expireCache =
    function() {
      Snapshot.hasElements = false;
      Snapshot.hasTwinIndexes = false;
      Snapshot.hasChildIndexes = false;
      cachedResults = {
        from: [],
        items: []
      };
    };

  if (
    document.implementation.hasFeature("MutationEvents", "2.0") ||
    document.implementation.hasFeature("Events", "2.0") &&
    document.implementation.hasFeature("Core", "2.0")) {
    // enable caching on browser supporting either Mutation Events (FF3/Safari/Opera/Konqueror)
    // or Core Events 2.0 (FF2 supports Mutation Events but are not shown in the implementation)
    setCache(true);
    // on page unload remove event listeners and cleanup
    window.addEventListener('beforeunload', function() {
        window.removeEventListener('beforeunload', arguments.callee, false);
        setCache(false);
      }, false
    );
  }

  return {

    // for testing purposes only!
    compile:
      function(selector) {
        return compileGroup(selector, true).toString();
      },

    // expose caching methods
    setCache: setCache,

    expireCache: expireCache,

    // element match selector return boolean true/false
    match:
      function(element, selector) {

        // make sure an element node was passed
        if (!(element && element.nodeType == 1)) {
          return false;
        }

        if (typeof selector == 'string' && selector.length) {

          // cache compiled matchers
          if (!compiledMatchers[selector]) {
            compiledMatchers[selector]=compileGroup(selector, false);
          }

          // result of compiled matcher
          return compiledMatchers[selector](element);

        } else throw new Error('NW.Dom.match: "' + selector + '" is not a valid CSS selector.');

        return false;
      },

    // elements matching selector optionally starting from node
    select:
      function(selector, from) {

        var elements = [], match;

        if (!(from && (from.nodeType == 1 || from.nodeType == 9))) {
          from = document;
        }

        if (typeof selector == 'string' && selector.length) {

          // BEGIN REDUCE/OPTIMIZE
          // * (all elements selector)
          if ((match = selector.match(Optimizations.all))) {
            var nodes, node, i = -1;
            // fix IE comments as element
            nodes = from.getElementsByTagName('*');
            while ((node = nodes[++i])) {
              if (node.nodeType == 1) {
                elements[elements.length] = node;
              }
            }
            return elements;
          }
          // #Foo Id (single id selector)
          else if ((match = selector.match(Optimizations.id))) {
            var element = from.getElementById(match[1]);
            return element ? [element] : [];
          }
          // Foo Tag (single tag selector)
          else if ((match = selector.match(Optimizations.tagName))) {
            return toArray(from.getElementsByTagName(match[1]));
          }
          // END REDUCE/OPTIMIZE

          if (cachingEnabled && Snapshot.hasElements) {
            elements = Snapshot.Elements;
          } else {
            elements = toArray(from.getElementsByTagName('*'));
            Snapshot.Elements = elements;
            Snapshot.hasTwinIndexes = false;
            Snapshot.hasChildIndexes = false;
          }

          // normal nth/child pseudo selectors
          if (selector.match(child_pseudo)) {
            if (!cachingEnabled || !Snapshot.hasChildIndexes) {
              getChilds(from, elements);
              Snapshot.hasChildIndexes = true;
            }
          }

          // special of-type pseudo selectors
          if (selector.match(oftype_pseudo)) {
            if (!cachingEnabled || !Snapshot.hasTwinIndexes) {
              getTwins(from, elements);
              Snapshot.hasTwinIndexes = true;
            }
          }

          Snapshot.hasElements = true;

          // cache compiled selectors
          if (!compiledSelectors[selector]) {
            compiledSelectors[selector] = compileGroup(selector, true);
          }

          if (cachingEnabled) {

            if (!(cachedResults.items[selector] && cachedResults.from[selector] == from)) {
              cachedResults.items[selector] = compiledSelectors[selector](elements, Snapshot);
              cachedResults.from[selector] = from;
            }
            // a previously cached selection of the same selector
            return cachedResults.items[selector];

          } else {

            // a live selection of the requested selector
            return compiledSelectors[selector](elements, Snapshot);

          }

        } else throw new Error('NW.Dom.select: "' + selector + '" is not a valid CSS selector.');

        return [];
      }

  };

}();
