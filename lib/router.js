'use strict';

const http    = require('http');
const Trie    = require('route-trie');
const compose = require('koa-compose');
const mount   = require('koa-mount');

const ROUTED = Symbol('ROUTED');

class Router {
    static get METHODS () {
        return http.METHODS;
    }

    static get ROUTED () {
        return ROUTED;
    }

    constructor (options) {
        if (new.target == null) {
            return new Router(options);
        }

        let root;
        if (options == null) {
            options = {};
        }
        else if (typeof options === 'string') {
            root    = options;
            options = {};
        }
        else {
            options = Object.assign({}, options);
            root    = options.root;

            delete options.root;
        }

        this.root = (typeof root === 'string') ? root : '/';
        if (!this.root.endsWith('/')) {
            this.root += '/';
        }

        this.trie        = new Trie(options);
        this._middleware = [];
        this._mounted    = new Map;
        this._options    = options;
        this._otherwise  = null;
        this._root       = this.root.slice(0, -1);
    }

    get Route () {
        return Route;
    }

    get middleware () {
        return [this.routes];
    }

    get routes () {
        return this.match.bind(this);
    }

    all (path, ...middleware) {
        const router = new this.constructor(this._options);
        router.otherwise(...middleware);
        return this.mount(path, router);
    }

    handle (method, path, ...middleware) {
        const route = this.route(path);
        route.handle(method, ...middleware);
        return route;
    }

    async match (context, next) {
        const method = context.method.toUpperCase();
        let path     = context.path;
        let handlers;

        if (context[ROUTED] || (!path.startsWith(this.root) && (path !== this._root))) {
            return;
        }

        context[ROUTED] = true;

        if (path === this._root) {
            path = '/';
        }
        else if (this._root.length > 0) {
            path = path.slice(this._root.length);
        }

        const matched = this.trie.match(path);
        if (matched.node == null) {
            if (matched.tsr || matched.fpr) {
                let url = matched.tsr;
                if (matched.fpr) {
                    url = matched.fpr;
                }

                if (this.root.length > 1) {
                    url = this.root + url.slice(1);
                }

                context.path   = url;
                context.status = (method === 'GET') ? 301 : 307;

                context.redirect(context.url);

                return;
            }

            if (this._otherwise == null) {
                context.throw(501, `"${ context.path }" not implemented.`);
            }

            handlers = this._otherwise;
        }
        else {
            handlers = matched.node.getHandler(method);
            if (handlers == null) {
                handlers = this._mounted.get(matched.node);
                if (handlers == null) {
                    // OPTIONS support
                    if (method === 'OPTIONS') {
                        context.status = 204;
                        context.set('allow', matched.node.getAllow());
                        return;
                    }

                    handlers = this._otherwise;
                    if (handlers == null) {
                        // If no route handler is returned, it's a 405 error
                        context.set('allow', matched.node.getAllow());
                        context.throw(405, `"${ context.method }" is not allowed in "${ context.path }"`);
                    }
                }
                else {
                    context[ROUTED] = false;
                }
            }
        }

        context.params = context.request.params = matched.params;

        await compose(this._middleware.concat(handlers))(context, next);
    }

    mount (root, router) {
        if (typeof root !== 'string') {
            [router, root] = [root, router];
        }

        if (root == null) {
            root = router._root;
        }

        router.root  = '/';
        router._root = '';

        const middleware = mount(root, router);
        const mounted    = this._mounted;

        const node = this.trie.define(root);
        const rest = this.trie.define(root + '/:rest*');

        if (mounted.has(node)) {
            throw new Error(`"${ root }" already mounted`);
        }

        if (mounted.has(rest)) {
            throw new Error(`"${ root }/:rest*" already mounted`);
        }

        mounted.set(node, middleware);
        mounted.set(rest, middleware);

        return this;
    }

    otherwise (...middleware) {
        this._otherwise = middleware;
        return this;
    }

    route (path) {
        return new this.Route(this, path);
    }

    use (...middleware) {
        this._middleware.push(...middleware);
        return this;
    }
}

class Route {
    constructor (router, path) {
        this.node = router.trie.define(path);
    }

    handle (method, ...middleware) {
        this.node.handle(method.toUpperCase(), middleware);
        return this;
    }
}

for (const METHOD of Router.METHODS) {
    const method = METHOD.toLowerCase();

    Router.prototype[method] = function (path, ...middleware) {
        return this.handle(method, path, ...middleware);
    };

    Route.prototype[method] = function (...middleware) {
        return this.handle(method, ...middleware);
    };
}

module.exports = Router;
