# koa-trout

Trie router for Koa

Based on [toa-router](https://github.com/toajs/toa-router)

## Setup

NPM:
```shell
npm install --save koa-trout
```

Yarn:
```shell
yarn add koa-trout
```

## Usage

#### Basic

```javascript
const Koa    = require('koa');
const Router = require('koa-trout');

const koa    = new Koa;
const router = new Router;

router.get('/hello',
    async function (context) {
        context.body = 'Hello, world!';
    }
);

koa.use(router.routes);

koa.listen(8080);
```

#### Params

```javascript
const Koa    = require('koa');
const Router = require('koa-trout');

const koa    = new Koa;
const router = new Router;

router.get('/hello/:to',
    async function (context, next) {
        context.body = `Hello, ${ context.params.to }!`;

        await next();
    }
);

koa.use(router.routes);

koa.listen(8080);
```

#### Middleware

```javascript
const Koa    = require('koa');
const Router = require('koa-trout');

const koa    = new Koa;
const router = new Router;

router.use(async function (context, next) {
    if (!context.get('authorization') !== 'password') {
        context.throw(401, 'unauthorized');
    }

    await next();
});

router.get('/secret',
    async function (context, next) {
        context.body = "You're in!";

        await next();
    }
);

koa.use(router.routes);

koa.listen(8080);
```

#### Multiple handlers

Handlers are just koa middleware, so you can mount route-specific middleware, and any number of handlers for a route.

```javascript
const Koa    = require('koa');
const Router = require('koa-trout');
const cors   = require('kcors');
const body   = require('koa-body');

const koa    = new Koa;
const router = new Router;

router.post('/users',
    cors(),
    body(),
    async function (context, next) {
        context.state.user = await User.query()
            .insert(context.request.body);

        await next();
    },
    async function (context, next) {
        context.body = context.state.user.toJSON();

        await next();
    }
);

koa.use(router.routes);

koa.listen(8080);
```

#### Multiple methods

```javascript
const Koa    = require('koa');
const Router = require('koa-trout');
const body   = require('koa-body');

const koa    = new Koa;
const router = new Router;

router.route(['patch', 'put'], '/users/:id',
    body(),
    async function (context, next) {
        context.state.user = await User.query()
            .patchAndFetchById(context.params.id, context.request.body);

        await next();
    },
    async function (context, next) {
        context.body = context.state.user.toJSON();

        await next();
    }
);

koa.use(router.routes);

koa.listen(8080);
```

#### Nested routers

```javascript
const Koa    = require('koa');
const Router = require('koa-trout');
const body   = require('koa-body');

const koa    = new Koa;
const router = new Router;
const api    = new Router;

router.get('/', async function (context, next) {
    context.body = 'Home';

    await next();
});

api.get('/users', async function (context, next) {
    context.body = { name: 'Bob' };

    await next();
});

router.mount('/api', api);

koa.use(router.routes);

koa.listen(8080);
```
