/**
 * A small Express-style router built on node:http.
 *
 * Design pattern: Chain of Responsibility. Each request flows through an ordered
 * list of middleware functions `(req, res, next)`; a handler either responds or
 * calls next() to pass the request on. Route handlers may be async — a rejected
 * promise is forwarded to the error handler, like Express 5.
 */
class Router {
  constructor() {
    this.layers = [];
    this.errorHandlers = [];
  }

  /** Register middleware for every request, or for paths starting with `prefix`. */
  use(prefixOrFn, maybeFn) {
    const [prefix, fn] = typeof prefixOrFn === 'function' ? ['/', prefixOrFn] : [prefixOrFn, maybeFn];
    if (fn.length === 4) {
      this.errorHandlers.push(fn);
    } else {
      this.layers.push({ method: null, prefix, fn });
    }
    return this;
  }

  route(method, pattern, ...handlers) {
    const keys = [];
    const regex = new RegExp(
      '^' +
        pattern.replace(/\/:([A-Za-z_]+)/g, (_, key) => {
          keys.push(key);
          return '/([^/]+)';
        }) +
        '/?$',
    );
    for (const fn of handlers) this.layers.push({ method, regex, keys, fn });
    return this;
  }

  get(pattern, ...h) { return this.route('GET', pattern, ...h); }
  post(pattern, ...h) { return this.route('POST', pattern, ...h); }
  put(pattern, ...h) { return this.route('PUT', pattern, ...h); }
  delete(pattern, ...h) { return this.route('DELETE', pattern, ...h); }

  /** Run a request through the chain. `done` is called if nothing responds. */
  handle(req, res, done) {
    let index = 0;
    const next = (err) => {
      if (err) return this.handleError(err, req, res);
      if (res.writableEnded) return undefined;
      const layer = this.layers[index++];
      if (!layer) return done(req, res);
      if (!this.matches(layer, req)) return next();
      try {
        const result = layer.fn(req, res, next);
        if (result && typeof result.catch === 'function') result.catch(next);
      } catch (e) {
        next(e);
      }
      return undefined;
    };
    next();
  }

  matches(layer, req) {
    const pathname = req.path;
    if (layer.method === null) {
      return layer.prefix === '/' || pathname === layer.prefix || pathname.startsWith(layer.prefix + '/');
    }
    if (layer.method !== req.method && !(layer.method === 'GET' && req.method === 'HEAD')) return false;
    const match = layer.regex.exec(pathname);
    if (!match) return false;
    req.params = {};
    layer.keys.forEach((key, i) => {
      try {
        req.params[key] = decodeURIComponent(match[i + 1]);
      } catch {
        req.params[key] = match[i + 1];
      }
    });
    return true;
  }

  handleError(err, req, res) {
    const handler = this.errorHandlers[0];
    if (handler) return handler(err, req, res, () => {});
    res.statusCode = 500;
    return res.end('Internal Server Error');
  }
}

module.exports = { Router };
