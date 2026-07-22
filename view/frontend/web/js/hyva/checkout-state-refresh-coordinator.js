define([], function () {
    'use strict';

    var DEFAULT_TTL = 750,
        states = typeof WeakMap === 'function' ? new WeakMap() : null,
        fallbackStates = [];

    function createState() {
        return {
            refreshPromise: null,
            forcedRefreshPromise: null,
            forceRevision: 0,
            completedForceRevision: 0,
            lastPayload: null,
            lastPayloadAt: 0
        };
    }

    function getState(wire) {
        var i,
            entry,
            state;

        if (states) {
            state = states.get(wire);
            if (!state) {
                state = createState();
                states.set(wire, state);
            }

            return state;
        }

        for (i = 0; i < fallbackStates.length; i++) {
            entry = fallbackStates[i];
            if (entry.wire === wire) {
                return entry.state;
            }
        }

        state = createState();
        fallbackStates.push({ wire: wire, state: state });

        return state;
    }

    function isStatePayload(payload) {
        return payload && typeof payload === 'object' && payload.totals;
    }

    function fetchFallback(options, wire, error) {
        if (typeof options.fetchState === 'function') {
            return options.fetchState(wire);
        }

        return Promise.reject(error || new Error('Checkout state response is invalid.'));
    }

    function requestPayload(wire, options) {
        var request;

        try {
            request = wire.call('refreshCheckoutState');
        } catch (error) {
            return Promise.resolve(fetchFallback(options, wire, error));
        }

        return Promise.resolve(request).then(function (payload) {
            return isStatePayload(payload)
                ? payload
                : fetchFallback(options, wire);
        }, function (error) {
            return fetchFallback(options, wire, error);
        });
    }

    function startRequest(wire, state, options) {
        var requestPromise,
            settledPromise;

        requestPromise = requestPayload(wire, options).then(function (payload) {
            state.lastPayload = payload;
            state.lastPayloadAt = Date.now();

            return payload;
        });

        settledPromise = requestPromise.then(function (payload) {
            if (state.refreshPromise === settledPromise) {
                state.refreshPromise = null;
            }

            return payload;
        }, function (error) {
            if (state.refreshPromise === settledPromise) {
                state.refreshPromise = null;
            }

            throw error;
        });
        state.refreshPromise = settledPromise;

        return settledPromise;
    }

    function startForcedQueue(wire, state, options) {
        var forcedPromise,
            settledPromise,
            initialRequest = state.refreshPromise;

        function runNextForcedRequest() {
            var targetRevision;

            if (state.completedForceRevision >= state.forceRevision) {
                return Promise.resolve(state.lastPayload);
            }

            targetRevision = state.forceRevision;

            return startRequest(wire, state, options).then(function (payload) {
                state.completedForceRevision = targetRevision;

                // A mutation registered after this request started needs one more
                // refresh. Multiple mutations before that next start still coalesce.
                return state.completedForceRevision < state.forceRevision
                    ? runNextForcedRequest()
                    : payload;
            });
        }

        forcedPromise = Promise.resolve(initialRequest).catch(function () {
            return null;
        }).then(runNextForcedRequest);

        settledPromise = forcedPromise.then(function (payload) {
            if (state.forcedRefreshPromise === settledPromise) {
                state.forcedRefreshPromise = null;
            }

            return payload;
        }, function (error) {
            if (state.forcedRefreshPromise === settledPromise) {
                state.forcedRefreshPromise = null;
            }

            throw error;
        });
        state.forcedRefreshPromise = settledPromise;

        return state.forcedRefreshPromise;
    }

    function refresh(wire, options) {
        var state,
            ttl;

        options = options || {};
        if (!wire || typeof wire.call !== 'function') {
            return Promise.reject(new Error('Magewire not available'));
        }

        state = getState(wire);
        ttl = typeof options.ttl === 'number' ? Math.max(0, options.ttl) : DEFAULT_TTL;

        if (options.force === true) {
            state.forceRevision += 1;

            return state.forcedRefreshPromise || startForcedQueue(wire, state, options);
        }

        if (state.forcedRefreshPromise) {
            return state.forcedRefreshPromise;
        }

        if (state.refreshPromise) {
            return state.refreshPromise;
        }

        if (
            state.lastPayload &&
            Date.now() - state.lastPayloadAt < ttl
        ) {
            return Promise.resolve(state.lastPayload);
        }

        return startRequest(wire, state, options);
    }

    function getLastPayload(wire) {
        if (!wire) {
            return null;
        }

        return getState(wire).lastPayload;
    }

    function invalidate(wire) {
        var state;

        if (!wire) {
            return;
        }

        state = getState(wire);
        state.lastPayload = null;
        state.lastPayloadAt = 0;
    }

    return {
        refresh: refresh,
        getLastPayload: getLastPayload,
        invalidate: invalidate
    };
});
