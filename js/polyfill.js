/* Nachrüstung für ältere Safari-/iOS-Versionen, die der PDF-Leser braucht. */
(function () {
  function def(o, k, v) { if (!o[k]) { try { Object.defineProperty(o, k, { value: v, writable: true, configurable: true }); } catch (e) {} } }
  var A = Array.prototype;
  def(A, 'at', function (n) { n = Math.trunc(n) || 0; if (n < 0) n += this.length; return n < 0 || n >= this.length ? undefined : this[n]; });
  def(A, 'findLast', function (f, t) { for (var i = this.length - 1; i >= 0; i--) if (f.call(t, this[i], i, this)) return this[i]; });
  def(A, 'findLastIndex', function (f, t) { for (var i = this.length - 1; i >= 0; i--) if (f.call(t, this[i], i, this)) return i; return -1; });
  def(A, 'toSorted', function (c) { return Array.prototype.slice.call(this).sort(c); });
  def(Uint8Array.prototype, 'at', A.at);
  def(String.prototype, 'at', A.at);
  def(String.prototype, 'replaceAll', function (a, b) {
    if (a instanceof RegExp) return this.replace(a, b);
    return this.split(String(a)).join(typeof b === 'function' ? b(a) : b);
  });
  def(Object, 'hasOwn', function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); });
  def(Promise, 'withResolvers', function () { var r = {}; r.promise = new Promise(function (a, b) { r.resolve = a; r.reject = b; }); return r; });
  if (typeof globalThis.structuredClone !== 'function') {
    var seen;
    var clone = function (v) {
      if (v === null || typeof v !== 'object') return v;
      if (seen.has(v)) return seen.get(v);
      var out;
      if (v instanceof Date) return new Date(v.getTime());
      if (v instanceof ArrayBuffer) { out = v.slice(0); seen.set(v, out); return out; }
      if (ArrayBuffer.isView(v)) { out = new v.constructor(v.buffer.slice(0), v.byteOffset, v.length); seen.set(v, out); return out; }
      if (v instanceof Map) { out = new Map(); seen.set(v, out); v.forEach(function (x, k) { out.set(clone(k), clone(x)); }); return out; }
      if (v instanceof Set) { out = new Set(); seen.set(v, out); v.forEach(function (x) { out.add(clone(x)); }); return out; }
      if (Array.isArray(v)) { out = []; seen.set(v, out); for (var i = 0; i < v.length; i++) out[i] = clone(v[i]); return out; }
      out = {}; seen.set(v, out);
      Object.keys(v).forEach(function (k) { out[k] = clone(v[k]); });
      return out;
    };
    globalThis.structuredClone = function (v) { seen = new Map(); return clone(v); };
  }
})();
