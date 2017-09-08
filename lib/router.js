'use strict';

const http    = require('http');
const Trie    = require('route-trie');
const compose = require('koa-compose');

const ROUTED = Symbol('Route');

class Router {
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
        this._otherwise  = null;
        this._root       = this.root.slice(0, -1);
    }

    get middleware () {
        return [this.routes];
    }

    get routes () {
        return this.match.bind(this);
    }

    define (pattern) {
        return new Route(this, pattern);
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

        const middleware = router.middleware;
        const node       = this.trie.define(root);
        const rest       = this.trie.define(root + '/:rest*');

        this._mounted.set(node, middleware);
        this._mounted.set(rest, middleware);

        return this;
    }

    otherwise (...middleware) {
        this._otherwise = middleware;
        return this;
    }

    use (...middleware) {
        this._middleware.push(...middleware);
        return this;
    }
}

class Route {
    constructor (router, pattern) {
        this.node = router.trie.define(pattern);
    }
}

for (const METHOD of http.METHODS) {
    const method = METHOD.toLowerCase();

    Router.prototype[method] = function (pattern, ...middleware) {
        this.trie.define(pattern).handle(METHOD, middleware);
        return this;
    };

    Route.prototype[method] = function (...middleware) {
        this.node.handle(METHOD, middleware);
        return this;
    };
}

Router.Route = Route;

module.exports = Router;
