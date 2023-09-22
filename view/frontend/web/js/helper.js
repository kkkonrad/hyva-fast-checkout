define(['iwdOpcSelectize', 'jquery', 'underscore', 'uiRegistry'], function (selectize, $, _, registry) {
    (function ($, window, document) {

        var pluginName = "textareaAutoSize";
        var pluginDataName = "plugin_" + pluginName;

        var containsText = function (value) {
            return (value.replace(/\s/g, '').length > 0);
        };

        function Plugin(element, options) {
            this.element = element;
            this.$element = $(element);
            this.init();
        }

        Plugin.prototype = {
            init: function () {
                var height = this.$element.outerHeight();
                var diff = parseInt(this.$element.css('paddingBottom')) +
                    parseInt(this.$element.css('paddingTop')) || 0;

                if (containsText(this.element.value)) {
                    this.$element.height(this.element.scrollHeight - diff);
                }

                // keyup is required for IE to properly reset height when deleting text
                this.$element.on('input keyup', function (event) {
                    var $window = $(window);
                    var currentScrollPosition = $window.scrollTop();

                    $(this)
                        .height(0)
                        .height(this.scrollHeight - diff);

                    $window.scrollTop(currentScrollPosition);
                });
            }
        };

        $.fn[pluginName] = function (options) {
            this.each(function () {
                if (!$.data(this, pluginDataName)) {
                    $.data(this, pluginDataName, new Plugin(this, options));
                }
            });
            return this;
        };

    })($, window, document);// textarea autoresize

    (function ($) {
        $.fn.selectRange = function (start, end) {
            if (end === undefined) {
                end = start;
            }
            return this.each(function () {
                if ('selectionStart' in this) {
                    this.selectionStart = start;
                    this.selectionEnd = end;
                } else if (this.setSelectionRange) {
                    this.setSelectionRange(start, end);
                } else if (this.createTextRange) {
                    var range = this.createTextRange();
                    range.collapse(true);
                    range.moveEnd('character', end);
                    range.moveStart('character', start);
                    range.select();
                }
            });
        };
    })($); // select range

    (function ($) {
        $.fn.getCursorPosition = function () {
            var input = this.get(0);
            if (!input) return; // No (input) element found
            if ('selectionStart' in input) {
                // Standard-compliant browsers
                return input.selectionStart;
            } else if (document.selection) {
                // IE
                input.focus();
                var sel = document.selection.createRange();
                var selLen = document.selection.createRange().text.length;
                sel.moveStart('character', -input.value.length);
                return sel.text.length - selLen;
            }
        }
    })($); // get cursor position

    $.fn.serializeAssoc = function () {
        var data = {};
        var dataArr = this.serializeArray();
        dataArr = dataArr.concat(
            $(this).find('input[type=checkbox]:not(:checked)').map(
                function () {
                    return {"name": this.name, "value": false}
                }).get()
        );
        $.each(dataArr, function (key, obj) {
            var a = obj.name.match(/(.*?)\[(.*?)\]/);
            if (a !== null) {
                var subName = a[1];
                var subKey = a[2];

                if (!data[subName]) {
                    data[subName] = {};
                }

                if (!subKey.length) {
                    subKey = data[subName].length;
                }

                if (data[subName][subKey]) {
                    if ($.isArray(data[subName][subKey])) {
                        data[subName][subKey].push(obj.value);
                    } else {
                        data[subName][subKey] = {};
                        data[subName][subKey].push(obj.value);
                    }
                } else {
                    data[subName][subKey] = obj.value;
                }
            } else {
                if (data[obj.name]) {
                    if ($.isArray(data[obj.name])) {
                        data[obj.name].push(obj.value);
                    } else {
                        data[obj.name] = {};
                        data[obj.name].push(obj.value);
                    }
                } else {
                    data[obj.name] = obj.value;
                }
            }
        });
        return data;
    };

    (function ($) {
        'use strict';

        // init flags & variables
        var debug = false;

        var browser = {
            data: {
                index: 0,
                name: 'scrollbar'
            },
            firefox: /firefox/i.test(navigator.userAgent),
            macosx: /mac/i.test(navigator.platform),
            msedge: /edge\/\d+/i.test(navigator.userAgent),
            msie: /(msie|trident)/i.test(navigator.userAgent),
            mobile: /android|webos|iphone|ipad|ipod|blackberry/i.test(navigator.userAgent),
            overlay: null,
            scroll: null,
            scrolls: [],
            webkit: /webkit/i.test(navigator.userAgent) && !/edge\/\d+/i.test(navigator.userAgent)
        };

        browser.scrolls.add = function (instance) {
            this.remove(instance).push(instance);
        };
        browser.scrolls.remove = function (instance) {
            while ($.inArray(instance, this) >= 0) {
                this.splice($.inArray(instance, this), 1);
            }
            return this;
        };

        var defaults = {
            autoScrollSize: true, // automatically calculate scrollsize
            autoUpdate: true, // update scrollbar if content/container size changed
            debug: false, // debug mode
            disableBodyScroll: false, // disable body scroll if mouse over container
            duration: 150, // scroll animate duration in ms
            ignoreMobile: false, // ignore mobile devices
            ignoreOverlay: false, // ignore browsers with overlay scrollbars (mobile, MacOS)
            isRtl: false, // is RTL
            scrollStep: 36, // scroll step for scrollbar arrows
            showArrows: false, // add class to show arrows
            stepScrolling: true, // when scrolling to scrollbar mousedown position

            scrollx: null, // horizontal scroll element
            scrolly: null, // vertical scroll element

            onDestroy: null, // callback function on destroy,
            onFallback: null, // callback function if scrollbar is not initialized
            onInit: null, // callback function on first initialization
            onScroll: null, // callback function on content scrolling
            onUpdate: null // callback function on init/resize (before scrollbar size calculation)
        };


        var BaseScrollbar = function (container) {

            if (!browser.scroll) {
                browser.overlay = isScrollOverlaysContent();
                browser.scroll = getBrowserScrollSize();
                updateScrollbars();

                $(window).resize(function () {
                    var forceUpdate = false;
                    if (browser.scroll && (browser.scroll.height || browser.scroll.width)) {
                        var scroll = getBrowserScrollSize();
                        if (scroll.height !== browser.scroll.height || scroll.width !== browser.scroll.width) {
                            browser.scroll = scroll;
                            forceUpdate = true; // handle page zoom
                        }
                    }
                    updateScrollbars(forceUpdate);
                });
            }

            this.container = container;
            this.namespace = '.scrollbar_' + browser.data.index++;
            this.options = $.extend({}, defaults, window.jQueryScrollbarOptions || {});
            this.scrollTo = null;
            this.scrollx = {};
            this.scrolly = {};

            container.data(browser.data.name, this);
            browser.scrolls.add(this);
        };

        BaseScrollbar.prototype = {
            destroy: function () {

                if (!this.wrapper) {
                    return;
                }

                this.container.removeData(browser.data.name);
                browser.scrolls.remove(this);

                // init variables
                var scrollLeft = this.container.scrollLeft();
                var scrollTop = this.container.scrollTop();

                this.container.insertBefore(this.wrapper).css({
                    "height": "",
                    "margin": "",
                    "max-height": ""
                })
                    .removeClass('scroll-content scroll-scrollx_visible scroll-scrolly_visible')
                    .removeAttr('tabindex')
                    .off(this.namespace)
                    .scrollLeft(scrollLeft)
                    .scrollTop(scrollTop);

                this.scrollx.scroll.removeClass('scroll-scrollx_visible').find('div').addBack().off(this.namespace);
                this.scrolly.scroll.removeClass('scroll-scrolly_visible').find('div').addBack().off(this.namespace);

                this.wrapper.remove();

                $(document).add('body').off(this.namespace);

                if ($.isFunction(this.options.onDestroy)) {
                    this.options.onDestroy.apply(this, [this.container]);
                }
            },
            init: function (options) {

                // init variables
                var S = this,
                    c = this.container,
                    cw = this.containerWrapper || c,
                    namespace = this.namespace,
                    o = $.extend(this.options, options || {}),
                    s = {x: this.scrollx, y: this.scrolly},
                    w = this.wrapper,
                    cssOptions = {};

                var initScroll = {
                    scrollLeft: c.scrollLeft(),
                    scrollTop: c.scrollTop()
                };

                // do not init if in ignorable browser
                if ((browser.mobile && o.ignoreMobile)
                    || (browser.overlay && o.ignoreOverlay)
                    || (browser.macosx && !browser.webkit) // still required to ignore nonWebKit browsers on Mac
                ) {
                    if ($.isFunction(o.onFallback)) {
                        o.onFallback.apply(this, [c]);
                    }
                    return false;
                }

                // init scroll container
                if (!w) {
                    this.wrapper = w = $('<div>').addClass('scroll-wrapper').attr('tabindex', 0)
                        // .addClass(c.attr('class'))
                        //     .attr('tabindex', 0)
                        .css('position', c.css('position') === 'absolute' ? 'absolute' : 'relative')
                        .insertBefore(c).append(c);

                    if (o.isRtl) {
                        w.addClass('scroll--rtl');
                    }

                    if (c.is('textarea')) {
                        this.containerWrapper = cw = $('<div>').insertBefore(c).append(c);
                        w.addClass('scroll-textarea');
                    }

                    cssOptions = {
                        "height": "auto",
                        // "margin-bottom": browser.scroll.height * -1 + 'px',
                        "max-height": ""
                    };
                    cssOptions[o.isRtl ? 'margin-left' : 'margin-right'] = browser.scroll.width * -1 + 'px';

                    cw.addClass('scroll-content').css(cssOptions).removeAttr('tabindex');

                    c.on('scroll' + namespace, function (event) {
                        var scrollLeft = c.scrollLeft();
                        var scrollTop = c.scrollTop();
                        if (o.isRtl) {
                            // webkit   0:100
                            // ie/edge  100:0
                            // firefox -100:0
                            switch (true) {
                                case browser.firefox:
                                    scrollLeft = Math.abs(scrollLeft);
                                    break;
                                case browser.msedge || browser.msie:
                                    scrollLeft = c[0].scrollWidth - c[0].clientWidth - scrollLeft;
                                    break;
                            }
                        }
                        if ($.isFunction(o.onScroll)) {
                            o.onScroll.call(S, {
                                maxScroll: s.y.maxScrollOffset,
                                scroll: scrollTop,
                                size: s.y.size,
                                visible: s.y.visible
                            }, {
                                maxScroll: s.x.maxScrollOffset,
                                scroll: scrollLeft,
                                size: s.x.size,
                                visible: s.x.visible
                            });
                        }
                        s.x.isVisible && s.x.scroll.bar.css('left', scrollLeft * s.x.kx + 'px');
                        s.y.isVisible && s.y.scroll.bar.css('top', scrollTop * s.y.kx + 'px');
                    });

                    c.on('keydown', function (event) {
                        var scrollLeft = c.scrollLeft();
                        var scrollTop = c.scrollTop();
                        s.x.isVisible && s.x.scroll.bar.css('left', scrollLeft * s.x.kx + 'px');
                        s.y.isVisible && s.y.scroll.bar.css('top', scrollTop * s.y.kx + 'px');
                    });

                    w.on('keydown', function (event) {
                        var scrollTop = c.scrollTop();
                        if (event.keyCode === 40) { //bottom
                            c.animate({
                                scrollTop: scrollTop + 36
                            }, 0);
                            event.preventDefault();
                        } else if (event.keyCode === 38) {//top
                            c.animate({
                                scrollTop: scrollTop - 36
                            }, 0);
                            event.preventDefault();
                        }
                    });

                    /* prevent native scrollbars to be visible on #anchor click */
                    w.on('scroll' + namespace, function () {
                        w.scrollTop(0).scrollLeft(0);
                    });

                    if (o.disableBodyScroll) {
                        var handleMouseScroll = function (event) {
                            isVerticalScroll(event) ?
                                s.y.isVisible && s.y.mousewheel(event) :
                                s.x.isVisible && s.x.mousewheel(event);
                        };
                        w.on('MozMousePixelScroll' + namespace, handleMouseScroll);
                        w.on('mousewheel' + namespace, handleMouseScroll);

                        if (browser.mobile) {
                            w.on('touchstart' + namespace, function (event) {
                                var touch = event.originalEvent.touches && event.originalEvent.touches[0] || event;
                                var originalTouch = {
                                    pageX: touch.pageX,
                                    pageY: touch.pageY
                                };
                                var originalScroll = {
                                    left: c.scrollLeft(),
                                    top: c.scrollTop()
                                };
                                $(document).on('touchmove' + namespace, function (event) {
                                    var touch = event.originalEvent.targetTouches && event.originalEvent.targetTouches[0] || event;
                                    c.scrollLeft(originalScroll.left + originalTouch.pageX - touch.pageX);
                                    c.scrollTop(originalScroll.top + originalTouch.pageY - touch.pageY);
                                    event.preventDefault();
                                });
                                $(document).on('touchend' + namespace, function () {
                                    $(document).off(namespace);
                                });
                            });
                        }
                    }
                    if ($.isFunction(o.onInit)) {
                        o.onInit.apply(this, [c]);
                    }
                } else {
                    cssOptions = {
                        "height": "auto",
                        // "margin-bottom": browser.scroll.height * -1 + 'px',
                        "max-height": ""
                    };
                    cssOptions[o.isRtl ? 'margin-left' : 'margin-right'] = browser.scroll.width * -1 + 'px';
                    cw.css(cssOptions);
                }

                // init scrollbars & recalculate sizes
                $.each(s, function (d, scrollx) {

                    var scrollCallback = null;
                    var scrollForward = 1;
                    var scrollOffset = (d === 'x') ? 'scrollLeft' : 'scrollTop';
                    var scrollStep = o.scrollStep;
                    var scrollTo = function () {
                        var currentOffset = c[scrollOffset]();
                        c[scrollOffset](currentOffset + scrollStep);
                        if (scrollForward === 1 && (currentOffset + scrollStep) >= scrollToValue)
                            currentOffset = c[scrollOffset]();
                        if (scrollForward === -1 && (currentOffset + scrollStep) <= scrollToValue)
                            currentOffset = c[scrollOffset]();
                        if (c[scrollOffset]() === currentOffset && scrollCallback) {
                            scrollCallback();
                        }
                    };
                    var scrollToValue = 0;

                    if (!scrollx.scroll) {

                        scrollx.scroll = S._getScroll(o['scroll' + d]).addClass('scroll-' + d);

                        if (o.showArrows) {
                            scrollx.scroll.addClass('scroll-element_arrows_visible');
                        }

                        scrollx.mousewheel = function (event) {

                            if (!scrollx.isVisible || (d === 'x' && isVerticalScroll(event))) {
                                return true;
                            }
                            if (d === 'y' && !isVerticalScroll(event)) {
                                s.x.mousewheel(event);
                                return true;
                            }

                            var delta = event.originalEvent.wheelDelta * -1 || event.originalEvent.detail;
                            var maxScrollValue = scrollx.size - scrollx.visible - scrollx.offset;

                            // fix new mozilla
                            if (!delta) {
                                if (d === 'x' && !!event.originalEvent.deltaX) {
                                    delta = event.originalEvent.deltaX * 40;
                                } else if (d === 'y' && !!event.originalEvent.deltaY) {
                                    delta = event.originalEvent.deltaY * 40;
                                }
                            }

                            if ((delta > 0 && scrollToValue < maxScrollValue) || (delta < 0 && scrollToValue > 0)) {
                                scrollToValue = scrollToValue + delta;
                                if (scrollToValue < 0)
                                    scrollToValue = 0;
                                if (scrollToValue > maxScrollValue)
                                    scrollToValue = maxScrollValue;

                                S.scrollTo = S.scrollTo || {};
                                S.scrollTo[scrollOffset] = scrollToValue;
                                setTimeout(function () {
                                    if (S.scrollTo) {
                                        c.stop().animate(S.scrollTo, 240, 'linear', function () {
                                            scrollToValue = c[scrollOffset]();
                                        });
                                        S.scrollTo = null;
                                    }
                                }, 1);
                            }

                            event.preventDefault();
                            return false;
                        };

                        scrollx.scroll
                            .on('MozMousePixelScroll' + namespace, scrollx.mousewheel)
                            .on('mousewheel' + namespace, scrollx.mousewheel)
                            .on('mouseenter' + namespace, function () {
                                scrollToValue = c[scrollOffset]();
                            });

                        // handle arrows & scroll inner mousedown event
                        scrollx.scroll.find('.scroll-arrow, .scroll-element_track')
                            .on('mousedown' + namespace, function (event) {

                                if (event.which !== 1) // lmb
                                    return true;

                                scrollForward = 1;

                                var data = {
                                    eventOffset: event[(d === 'x') ? 'pageX' : 'pageY'],
                                    maxScrollValue: scrollx.size - scrollx.visible - scrollx.offset,
                                    scrollbarOffset: scrollx.scroll.bar.offset()[(d === 'x') ? 'left' : 'top'],
                                    scrollbarSize: scrollx.scroll.bar[(d === 'x') ? 'outerWidth' : 'outerHeight']()
                                };
                                var timeout = 0, timer = 0;

                                if ($(this).hasClass('scroll-arrow')) {
                                    scrollForward = $(this).hasClass("scroll-arrow_more") ? 1 : -1;
                                    scrollStep = o.scrollStep * scrollForward;
                                    scrollToValue = scrollForward > 0 ? data.maxScrollValue : 0;
                                    if (o.isRtl) {
                                        switch (true) {
                                            case browser.firefox:
                                                scrollToValue = scrollForward > 0 ? 0 : data.maxScrollValue * -1;
                                                break;
                                            case browser.msie || browser.msedge:
                                                break;
                                        }
                                    }
                                } else {
                                    scrollForward = (data.eventOffset > (data.scrollbarOffset + data.scrollbarSize) ? 1
                                        : (data.eventOffset < data.scrollbarOffset ? -1 : 0));
                                    if (d === 'x' && o.isRtl && (browser.msie || browser.msedge))
                                        scrollForward = scrollForward * -1;
                                    scrollStep = Math.round(scrollx.visible * 0.75) * scrollForward;
                                    scrollToValue = (data.eventOffset - data.scrollbarOffset -
                                        (o.stepScrolling ? (scrollForward === 1 ? data.scrollbarSize : 0)
                                            : Math.round(data.scrollbarSize / 2)));
                                    scrollToValue = c[scrollOffset]() + (scrollToValue / scrollx.kx);
                                }

                                S.scrollTo = S.scrollTo || {};
                                S.scrollTo[scrollOffset] = o.stepScrolling ? c[scrollOffset]() + scrollStep : scrollToValue;

                                if (o.stepScrolling) {
                                    scrollCallback = function () {
                                        scrollToValue = c[scrollOffset]();
                                        clearInterval(timer);
                                        clearTimeout(timeout);
                                        timeout = 0;
                                        timer = 0;
                                    };
                                    timeout = setTimeout(function () {
                                        timer = setInterval(scrollTo, 40);
                                    }, o.duration + 100);
                                }

                                setTimeout(function () {
                                    if (S.scrollTo) {
                                        c.animate(S.scrollTo, o.duration);
                                        S.scrollTo = null;
                                    }
                                }, 1);

                                return S._handleMouseDown(scrollCallback, event);
                            });

                        // handle scrollbar drag'n'drop
                        scrollx.scroll.bar.on('mousedown' + namespace, function (event) {

                            if (event.which !== 1) // lmb
                                return true;

                            var eventPosition = event[(d === 'x') ? 'pageX' : 'pageY'];
                            var initOffset = c[scrollOffset]();

                            scrollx.scroll.addClass('scroll-draggable');

                            $(document).on('mousemove' + namespace, function (event) {
                                var diff = parseInt((event[(d === 'x') ? 'pageX' : 'pageY'] - eventPosition) / scrollx.kx, 10);
                                if (d === 'x' && o.isRtl && (browser.msie || browser.msedge))
                                    diff = diff * -1;
                                c[scrollOffset](initOffset + diff);
                            });

                            return S._handleMouseDown(function () {
                                scrollx.scroll.removeClass('scroll-draggable');
                                scrollToValue = c[scrollOffset]();
                            }, event);
                        });
                    }
                });

                // remove classes & reset applied styles
                $.each(s, function (d, scrollx) {
                    var scrollClass = 'scroll-scroll' + d + '_visible';
                    var scrolly = (d === "x") ? s.y : s.x;

                    scrollx.scroll.removeClass(scrollClass);
                    scrolly.scroll.removeClass(scrollClass);
                    cw.removeClass(scrollClass);
                });

                // calculate init sizes
                $.each(s, function (d, scrollx) {
                    $.extend(scrollx, (d === "x") ? {
                        offset: parseInt(c.css('left'), 10) || 0,
                        size: c.prop('scrollWidth'),
                        visible: w.width()
                    } : {
                        offset: parseInt(c.css('top'), 10) || 0,
                        size: c.prop('scrollHeight'),
                        visible: w.height()
                    });
                });

                // update scrollbar visibility/dimensions
                this._updateScroll('x', this.scrollx);
                this._updateScroll('y', this.scrolly);

                if ($.isFunction(o.onUpdate)) {
                    o.onUpdate.apply(this, [c]);
                }

                // calculate scroll size
                $.each(s, function (d, scrollx) {

                    var cssOffset = (d === 'x') ? 'left' : 'top';
                    var cssFullSize = (d === 'x') ? 'outerWidth' : 'outerHeight';
                    var cssSize = (d === 'x') ? 'width' : 'height';
                    var offset = parseInt(c.css(cssOffset), 10) || 0;

                    var AreaSize = scrollx.size;
                    var AreaVisible = scrollx.visible + offset;

                    var scrollSize = scrollx.scroll.size[cssFullSize]() + (parseInt(scrollx.scroll.size.css(cssOffset), 10) || 0);

                    if (o.autoScrollSize) {
                        scrollx.scrollbarSize = parseInt(scrollSize * AreaVisible / AreaSize, 10);
                        scrollx.scroll.bar.css(cssSize, scrollx.scrollbarSize + 'px');
                    }

                    scrollx.scrollbarSize = scrollx.scroll.bar[cssFullSize]();
                    scrollx.kx = ((scrollSize - scrollx.scrollbarSize) / (AreaSize - AreaVisible)) || 1;
                    scrollx.maxScrollOffset = AreaSize - AreaVisible;
                });

                c.scrollLeft(initScroll.scrollLeft).scrollTop(initScroll.scrollTop).trigger('scroll');
            },

            _getScroll: function (scroll) {
                var types = {
                    advanced: [
                        '<div class="scroll-element">',
                        '<div class="scroll-element_corner"></div>',
                        '<div class="scroll-arrow scroll-arrow_less"></div>',
                        '<div class="scroll-arrow scroll-arrow_more"></div>',
                        '<div class="scroll-element_outer">',
                        '<div class="scroll-element_size"></div>', // required! used for scrollbar size calculation !
                        '<div class="scroll-element_inner-wrapper">',
                        '<div class="scroll-element_inner scroll-element_track">', // used for handling scrollbar click
                        '<div class="scroll-element_inner-bottom"></div>',
                        '</div>',
                        '</div>',
                        '<div class="scroll-bar">', // required
                        '<div class="scroll-bar_body">',
                        '<div class="scroll-bar_body-inner"></div>',
                        '</div>',
                        '<div class="scroll-bar_bottom"></div>',
                        '<div class="scroll-bar_center"></div>',
                        '</div>',
                        '</div>',
                        '</div>'
                    ].join(''),
                    simple: [
                        '<div class="scroll-element">',
                        '<div class="scroll-element_outer">',
                        '<div class="scroll-element_size"></div>', // required! used for scrollbar size calculation !
                        '<div class="scroll-element_track"></div>', // used for handling scrollbar click
                        '<div class="scroll-bar"></div>', // required
                        '</div>',
                        '</div>'
                    ].join('')
                };
                if (types[scroll]) {
                    scroll = types[scroll];
                }
                if (!scroll) {
                    scroll = types['simple'];
                }
                if (typeof (scroll) === 'string') {
                    scroll = $(scroll).appendTo(this.wrapper);
                } else {
                    scroll = $(scroll);
                }
                $.extend(scroll, {
                    bar: scroll.find('.scroll-bar'),
                    size: scroll.find('.scroll-element_size'),
                    track: scroll.find('.scroll-element_track')
                });
                return scroll;
            },
            _handleMouseDown: function (callback, event) {

                var namespace = this.namespace;

                $(document).on('blur' + namespace, function () {
                    $(document).add('body').off(namespace);
                    callback && callback();
                });
                $(document).on('dragstart' + namespace, function (event) {
                    event.preventDefault();
                    return false;
                });
                $(document).on('mouseup' + namespace, function () {
                    $(document).add('body').off(namespace);
                    callback && callback();
                });
                $('body').on('selectstart' + namespace, function (event) {
                    event.preventDefault();
                    return false;
                });

                event && event.preventDefault();
                return false;
            },
            _updateScroll: function (d, scrollx) {

                var container = this.container,
                    containerWrapper = this.containerWrapper || container,
                    scrollClass = 'scroll-scroll' + d + '_visible',
                    scrolly = (d === 'x') ? this.scrolly : this.scrollx,
                    offset = parseInt(this.container.css((d === 'x') ? 'left' : 'top'), 10) || 0,
                    wrapper = this.wrapper;

                var AreaSize = scrollx.size;
                var AreaVisible = scrollx.visible + offset;

                scrollx.isVisible = (AreaSize - AreaVisible) > 1; // bug in IE9/11 with 1px diff
                if (scrollx.isVisible) {
                    scrollx.scroll.addClass(scrollClass);
                    scrolly.scroll.addClass(scrollClass);
                    containerWrapper.addClass(scrollClass);
                } else {
                    scrollx.scroll.removeClass(scrollClass);
                    scrolly.scroll.removeClass(scrollClass);
                    containerWrapper.removeClass(scrollClass);
                }

                if (d === 'y') {
                    if (container.is('textarea') || AreaSize < AreaVisible) {
                        containerWrapper.css({
                            "height": (AreaVisible + browser.scroll.height + browser.scroll.height) + 'px',
                            "max-height": "none"
                        });
                    } else {
                        containerWrapper.css({
                            // "height": "auto", // do not reset height value: issue with height:100%!
                            "max-height": (AreaVisible + browser.scroll.height + browser.scroll.height) + 'px'
                            // "height": (AreaVisible) + 'px'
                        });
                    }
                }

                if (scrollx.size !== container.prop('scrollWidth')
                    || scrolly.size !== container.prop('scrollHeight')
                    || scrollx.visible !== wrapper.width()
                    || scrolly.visible !== wrapper.height()
                    || scrollx.offset !== (parseInt(container.css('left'), 10) || 0)
                    || scrolly.offset !== (parseInt(container.css('top'), 10) || 0)
                ) {
                    $.extend(this.scrollx, {
                        offset: parseInt(container.css('left'), 10) || 0,
                        size: container.prop('scrollWidth'),
                        visible: wrapper.width()
                    });
                    $.extend(this.scrolly, {
                        offset: parseInt(container.css('top'), 10) || 0,
                        size: this.container.prop('scrollHeight'),
                        visible: wrapper.height()
                    });
                    this._updateScroll(d === 'x' ? 'y' : 'x', scrolly);
                }
            }
        };

        var CustomScrollbar = BaseScrollbar;

        /*
         * Extend jQuery as plugin
         *
         * @param {Mixed} command to execute
         * @param {Mixed} arguments as Array
         * @return {jQuery}
         */
        $.fn.scrollbar = function (command, args) {
            if (typeof command !== 'string') {
                args = command;
                command = 'init';
            }
            if (typeof args === 'undefined') {
                args = [];
            }
            if (!$.isArray(args)) {
                args = [args];
            }
            this.not('body, .scroll-wrapper').each(function () {
                var element = $(this),
                    instance = element.data(browser.data.name);
                if (instance || command === 'init') {
                    if (!instance) {
                        instance = new CustomScrollbar(element);
                    }
                    if (instance[command]) {
                        instance[command].apply(instance, args);
                    }
                }
            });
            return this;
        };

        /**
         * Connect default options to global object
         */
        $.fn.scrollbar.options = defaults;


        /**
         * Check if scroll content/container size is changed
         */

        var updateScrollbars = (function () {
            var timer = 0,
                timerCounter = 0;

            return function (force) {
                var i, container, options, scroll, wrapper, scrollx, scrolly;
                for (i = 0; i < browser.scrolls.length; i++) {
                    scroll = browser.scrolls[i];
                    container = scroll.container;
                    options = scroll.options;
                    wrapper = scroll.wrapper;
                    scrollx = scroll.scrollx;
                    scrolly = scroll.scrolly;
                    if (force || (options.autoUpdate && wrapper && wrapper.is(':visible') &&
                        (container.prop('scrollWidth') !== scrollx.size || container.prop('scrollHeight') !== scrolly.size || wrapper.width() !== scrollx.visible || wrapper.height() !== scrolly.visible))) {
                        scroll.init();

                        if (options.debug) {
                            window.console && console.log({
                                scrollHeight: container.prop('scrollHeight') + ':' + scroll.scrolly.size,
                                scrollWidth: container.prop('scrollWidth') + ':' + scroll.scrollx.size,
                                visibleHeight: wrapper.height() + ':' + scroll.scrolly.visible,
                                visibleWidth: wrapper.width() + ':' + scroll.scrollx.visible
                            }, true);
                            timerCounter++;
                        }
                    }
                }
                if (debug && timerCounter > 10) {
                    window.console && console.log('Scroll updates exceed 10');
                    updateScrollbars = function () {
                    };
                } else {
                    clearTimeout(timer);
                    timer = setTimeout(updateScrollbars, 300);
                }
            };
        })();

        function getBrowserScrollSize(actualSize) {

            if (browser.webkit && !actualSize) {
                return {
                    height: 0,
                    width: 0
                };
            }

            if (!browser.data.outer) {
                var css = {
                    "border": "none",
                    "box-sizing": "content-box",
                    "height": "200px",
                    "margin": "0",
                    "padding": "0",
                    "width": "200px"
                };
                browser.data.inner = $("<div>").css($.extend({}, css));
                browser.data.outer = $("<div>").css($.extend({
                    "left": "-1000px",
                    "overflow": "scroll",
                    "position": "absolute",
                    "top": "-1000px"
                }, css)).append(browser.data.inner).appendTo("body");
            }

            browser.data.outer.scrollLeft(1000).scrollTop(1000);

            return {
                // height: Math.ceil((browser.data.outer.offset().top - browser.data.inner.offset().top) || 0),
                height: 0,
                width: Math.ceil((browser.data.outer.offset().left - browser.data.inner.offset().left) || 0)
            };
        }

        /**
         * Check if native browser scrollbars overlay content
         *
         * @returns {Boolean}
         */
        function isScrollOverlaysContent() {
            var scrollSize = getBrowserScrollSize(true);
            return !(scrollSize.height || scrollSize.width);
        }

        function isVerticalScroll(event) {
            var e = event.originalEvent;
            if (e.axis && e.axis === e.HORIZONTAL_AXIS){
                return false;
            }

            return !e.wheelDeltaX;

        }
    })($); // custom scrollbar

    (function ($) {
        $.fn.addBack = $.fn.addBack || $.fn.andSelf;

        $.fn.extend({

            actualScrollHeight: function () {
                var $target = this.eq(0);
                var fix, restore;
                var tmp = [];
                var style = '';
                var $hidden;
                var $this = $(this);
                fix = function () {
                    // get all hidden parents
                    $hidden = $target.parents().addBack().filter(':hidden');
                    style += 'visibility: hidden !important; display: block !important; ';


                    $hidden.each(function () {
                        var $this = $(this);
                        var thisStyle = $this.attr('style');

                        tmp.push(thisStyle);
                        $this.attr('style', thisStyle ? thisStyle + ';' + style : style);
                    });
                };

                restore = function () {
                    // restore origin style values
                    $hidden.each(function (i) {
                        var $this = $(this);
                        var _tmp = tmp[i];

                        if (_tmp === undefined) {
                            $this.removeAttr('style');
                        } else {
                            $this.attr('style', _tmp);
                        }
                    });
                };

                fix();
                var actual = $target.get(0).scrollHeight;
                restore();

                return actual;
            }
        });
    })($);

    (function ($, window, document) {
        $.fn.decorateSelect = function (showEmptyOption, disableSearch) {
            if (typeof showEmptyOption === 'undefined') { showEmptyOption = false; }
            if (typeof disableSearch === 'undefined') { disableSearch = false; }
            var $select = $(this),
                $uiObject = registry.get('uid=' + $select.attr('id')),
                $emptyOptions = $select.find('option[value=""]'),
                $text = '',
                $activeOption;

            if ($uiObject && $uiObject.indexedOptions['']) {
                $text = $uiObject.indexedOptions['']['label'];
            } else if ($emptyOptions.length) {
                $text = $emptyOptions.first().text();
            }

            if ($emptyOptions.length) {
                var $newEmptyOption = $('<option/>').attr('value', '').text($text);
                var currentVal = $select.val();

                if (!currentVal) {
                    $newEmptyOption.prop('selected', true);
                }

                $emptyOptions.remove();
                $select.prepend($newEmptyOption);
            }

            $select.change(function(){
                $select = $(this);

                if ($select && $select[0] && $select[0].selectize) {
                    $select[0].selectize.addItem($select.val(), true);
                }
            }).selectize({
                selectOnTab: true,
                persist: false,
                placeholder: $text,
                allowEmptyOption: showEmptyOption,
                disableSearch: disableSearch,
                onChange: function() {
                    var value = this.$input.val(),
                        changed = this.$input.html(),
                        elements = $("select[name='" + this.$input.attr('name') +"']");

                    this.$input.val('');
                    this.$input.val(value);

                    this.$input.get(0).indeterminate = true;
                    if ("createEvent" in document) {
                        var c_event = document.createEvent("HTMLEvents");
                        c_event.initEvent("change", false, true);
                        this.$input.get(0).dispatchEvent(c_event);
                    } else {
                        this.$input.get(0).fireEvent("onchange");
                    }

                    if (elements.length > 1) {
                        elements.each(function() {
                            $(this).html(changed);
                        });
                    }

                    this.$input.trigger('change');
                },
                onFocus: function () {
                    if ($select
                        && $select[0]
                        && $select[0].selectize
                        && ($select[0].name === 'country_id' || $select[0].name === 'region_id')
                    ) {
                        var activeSelect = $select[0].selectize,
                            value = $select[0].selectize.getItem($select[0].selectize.getValue()).text();

                        if (value && value.length > 0) {
                            $activeOption = $select[0].selectize.getValue();
                            activeSelect.clear(silent = true);
                            activeSelect.setTextboxValue('');
                        }
                    }
                },
                onBlur: function () {
                    var value = $select[0].selectize.getItem($select[0].selectize.getValue()).text();

                    if (!value && $activeOption) {
                        $select[0].selectize.setValue($activeOption);
                    }
                },
                onInitialize: function () {
                    this.$input.attr('tabindex', -1).css({'position': 'absolute', 'opacity': '0'}).after(this.$wrapper);
                }
            });

            $('.selectize-input input').addClass('input-text');

            return this;
        };

        $.fn.decorateSelectCustom = function() {
            var select = this;
            var parent = select.parent();
            if (select.find('option').length) {
                var options = select.find('option');
                var newSelectClass = '';
                var canUnselect = !!options.filter(function (index) {
                    return !$(this).html().trim().length && !$(this).val();
                }).length;
                if (select.attr('data-can-unselect')) {
                    canUnselect = select.attr('data-can-unselect');
                }
                var selectedOption = options.filter(':selected').first();
                if (!select.attr('multiple') && (selectedOption.html().trim().length || (selectedOption.length && selectedOption.attr('data-image')))) {
                    newSelectClass += ' selected';
                }

                newSelectClass += (select.is(':disabled') ? ' disabled' : '');
                newSelectClass += (select.attr('multiple') ? ' multiple' : '');
                var newSelect = $('<div></div>');
                newSelect
                    .attr('tabindex', 0)
                    .attr('title', select.attr('title'))
                    .attr('data-element-id', select.attr('id'))
                    .attr('data-can-unselect', canUnselect)
                    .addClass('iwd_opc_select_container' + newSelectClass);
                options.each(function () {
                    var option = $(this);
                    if (option.html().trim().length) {
                        var newOptionClass = (option.is(':selected') ? ' selected' : '');
                        var newOption = $('<div></div>');
                        var optionHtml = '';
                        if (option.data('ccTypes')) {
                            var ccTypes = option.data('ccTypes');
                            var ccPreviewHtml = $('<div></div>');
                            var i = 0;
                            _.each(ccTypes, function (title, code) {
                                if (i === 2) {
                                    return false;
                                }

                                var ccTypeHtml = $('<div class="iwd_opc_cc_wrapper"></div>').attr('data-cc-type', code).attr('title', title);
                                ccPreviewHtml.append(ccTypeHtml);
                                i++;
                            });

                            optionHtml += '<div class="iwd_opc_cc_preview">' + ccPreviewHtml.html() + '</div>';
                            if (Object.keys(ccTypes).length > 2) {
                                newOption.addClass('iwd_opc_cc_option_long');
                                var ccTypesHtml = $('<div class="iwd_opc_cc_types_tooltip_content"></div>');
                                _.each(ccTypes, function (title, code) {
                                    var ccTypeHtml = $('<div class="iwd_opc_cc_wrapper"></div>').attr('data-cc-type', code).attr('title', title);
                                    ccTypesHtml.append(ccTypeHtml);
                                });
                                var tooltipContentClass = 'iwd_opc_cc_tooltip_content_small';
                                if (Object.keys(ccTypes).length > 4) {
                                    tooltipContentClass = 'iwd_opc_cc_tooltip_content_big';
                                }

                                optionHtml += '<div data-icon="&#xf196" class="iwd_opc_field_tooltip iwd_opc_cc_types_tooltip"><div class="' + tooltipContentClass + ' iwd_opc_field_tooltip_content">' + ccTypesHtml.html() + '</div></div>';
                            } else {
                                newOption.addClass('iwd_opc_cc_option_short');
                            }
                        }

                        optionHtml += option.html();
                        if (option.attr('data-image')) {
                            newOption.addClass('iwd_opc_option_with_image');
                            optionHtml += '<img class="iwd_opc_option_image" src="' + option.attr('data-image') + '" />';
                        }

                        newOption
                            .html(optionHtml)
                            .attr('data-value', option.val())
                            .attr('data-position-top', 0)
                            .attr('data-first-letter', option.html().charAt(0).toLowerCase())
                            .addClass('iwd_opc_select_option' + newOptionClass);
                        newSelect.append(newOption);
                    }
                });

                parent.find('.iwd_opc_select_container').scrollbar('destroy');
                parent.find('.iwd_opc_select_container').remove();
                parent.append(newSelect);
                select.attr('tabindex', -1);
                if (newSelect.hasClass('selected')) {
                    newSelect.removeClass('selected');
                    if (newSelect.children().length > 6 || newSelect.actualScrollHeight() > parseInt(newSelect.css('max-height').replace('px', ''))) {
                        newSelect.scrollbar();
                    }

                    newSelect.addClass('selected');
                    newSelect.css('height', 'auto');
                } else {
                    if (newSelect.children().length > 6 || newSelect.actualScrollHeight() > parseInt(newSelect.css('max-height').replace('px', ''))) {
                        newSelect.scrollbar();
                    }
                }
                select.hide();
            } else {
                parent.find('.iwd_opc_select_container').scrollbar('destroy');
                parent.find('.iwd_opc_select_container').remove();
            }

            return this;
        };
    })($, window, document); //decorate select

    function unSelectValueInCustomSelect(option, selectNative) {
        var newSelect = option.parent();
        if (typeof(selectNative) === 'undefined') {
            selectNative = true;
        }

        if (newSelect.hasClass('multiple')) {
            option.removeClass('selected');
            if (selectNative) {
                unSelectValueInNativeSelect(newSelect.attr('data-element-id'), option.attr('data-value'));
            }

            return;
        }

        if (newSelect.hasClass('selected')) {
            newSelect.removeClass('selected');
            newSelect.animate({
                scrollTop: option.position().top - parseInt(option.attr('data-position-top'))
            }, 0);
            if (newSelect.attr('data-can-unselect') === "true") {
                option.removeClass('selected');
                if (selectNative) {
                    selectValueInNativeSelect(newSelect.attr('data-element-id'), "");
                }
            }
        } else {
            option.attr('data-position-top', option.position().top);
            newSelect.addClass('selected');
        }

        // }
    }

    function selectValueInCustomSelect(option, selectNative) {
        if (typeof(selectNative) === 'undefined') {
            selectNative = true;
        }

        var newSelect = option.parent();
        option.attr('data-position-top', option.position().top);

        if (!newSelect.hasClass('multiple')) {
            newSelect.find('.iwd_opc_select_option').removeClass('selected');
        }

        option.addClass('selected');
        if (!newSelect.hasClass('multiple')) {
            newSelect.addClass('selected');
        }

        if (selectNative) {
            selectValueInNativeSelect(newSelect.attr('data-element-id'), option.attr('data-value'));
        }

        newSelect.css('height', 'auto');
    }

    function selectValueInNativeSelect(elementId, value) {
        var select = $('select[id="' + elementId + '"]');
        if (select.length) {
            if (select.attr('multiple')) {
                var selectValues = select.val() || [];
                selectValues.push(value);
                select.val(selectValues);
            } else {
                select.val(value);
            }


            select.get(0).indeterminate = true;
            if ("createEvent" in document) {
                var c_event = document.createEvent("HTMLEvents");
                c_event.initEvent("change", false, true);
                select.get(0).dispatchEvent(c_event);
            } else {
                select.get(0).fireEvent("onchange");
            }

            select.trigger('change');
        }
    }

    function unSelectValueInNativeSelect(elementId, value) { //only for multiple selects
        var select = $('select[id="' + elementId + '"][multiple]');
        if (select.length) {
            var selectValues = select.val();
            selectValues.remove(value);
            select.val(selectValues);
            select.get(0).indeterminate = true;
            if ("createEvent" in document) {
                var c_event = document.createEvent("HTMLEvents");
                c_event.initEvent("change", false, true);
                select.get(0).dispatchEvent(c_event);
            } else {
                select.get(0).fireEvent("onchange");
            }

            select.trigger('change');
        }
    }

    var section = '.iwd_main_wrapper';

    $(document).on('click',
        section + ' .iwd_opc_select_container:not(.disabled) .iwd_opc_select_option', function () {
            var option = $(this);
            if (option.hasClass('selected')) {
                unSelectValueInCustomSelect(option);
            } else {
                selectValueInCustomSelect(option);
            }
        });

    $(document).on('change', section + ' select', function (e) {
        if ($(this).attr('multiple')) {
            return;
        }

        var option = $(section + ' .iwd_opc_select_container[data-element-id="' +
            $(this).attr('id') + '"] .iwd_opc_select_option[data-value="' + $(this).val() + '"]');
        if (option.length) {
            selectValueInCustomSelect(option, false);
        } else {
            option = $(section + ' .iwd_opc_select_container[data-element-id="' +
                $(this).attr('id') + '"] .iwd_opc_select_option.selected');
            if (option.length) {
                unSelectValueInCustomSelect(option, false);
            }
        }
    });

    $(document).on('focusout', section + ' .iwd_opc_select_container:not(.disabled), '
        + section + ' .scroll-wrapper',
        function (event) {
            var newSelect = $(this);
            if (newSelect.hasClass('scroll-wrapper')) {
                newSelect = newSelect.find('.iwd_opc_select_container').first();
            }

            if (!newSelect.hasClass('multiple')) {
                setTimeout(function () {
                    if (newSelect.find('.iwd_opc_select_option.selected').length) {
                        newSelect.addClass('selected');
                    }
                }, 200);
            }

            $(section + ' select[id="' + $(this).attr('data-element-id') + '"]')
                .trigger('blur');
        });

    $(document).on('keydown', section + ' .iwd_opc_select_container:not(.disabled), '
        + section + ' .scroll-wrapper', function (e) {
        var newSelect = $(this);
        if (newSelect.hasClass('scroll-wrapper')) {
            newSelect = newSelect.find('.iwd_opc_select_container').first();
        }

        if (e.keyCode === 13) { //enter
            if (newSelect.hasClass('selected')) {
                newSelect.removeClass('selected');
                if (newSelect.find('.iwd_opc_select_option.selected').length) {
                    var option = newSelect.find('.iwd_opc_select_option.selected').first();
                    newSelect.animate({
                        scrollTop: option.position().top - parseInt(option.attr('data-position-top'))
                    }, 0);
                }
            }
        } else if (e.keyCode === 27) { //esc
            if (newSelect.find('.iwd_opc_select_option.selected').length) {
                newSelect.addClass('selected');
            }
        } else if (e.keyCode === 38 || e.keyCode === 40) {

        } else {
            var key = String.fromCharCode(e.keyCode).toLowerCase();
            newSelect.find('.iwd_opc_select_option').each(function () {
                var option = $(this);
                if (option.attr('data-first-letter').indexOf(key) === 0) {
                    option.parent().animate({
                        scrollTop: option.get(0).offsetTop
                    }, 0);
                    return false;
                }
            });
        }
    });
});

if (!String.prototype.endsWith) {
    String.prototype.endsWith = function(search, this_len) {
        if (this_len === undefined || this_len > this.length) {
            this_len = this.length;
        }
        return this.substring(this_len - search.length, this_len) === search;
    };
}

Array.prototype.remove = function () {
    var what, a = arguments, L = a.length, ax;
    while (L && this.length) {
        what = a[--L];
        while ((ax = this.indexOf(what)) !== -1) {
            this.splice(ax, 1);
        }
    }
    return this;
};
