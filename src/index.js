const fs = require('fs');
const path = require('path');
const get = require('lodash.get');
const set = require('lodash.set');
const mergeWith = require('lodash.mergewith');
const yaml = require('js-yaml');

const concatArrays = (objValue, srcValue) => ([objValue, srcValue]
  .every(Array.isArray) ? objValue.concat(srcValue) : undefined);

const loadRecursive = (dir, relDir, data, vars) => {
  let result = data;
  if (typeof result === 'string' || result instanceof String) {
    // replace yaml variables with defaults
    result = result.replace(
      /\${opt:([a-zA-Z0-9]+?)(?:, ["']([a-zA-Z0-9\-.]+?)["'])?}/g,
      (match, k, v) => get(vars, k, v || match)
    );
    // load requires 1
    const match = (
      // eslint-disable-next-line max-len
      /\${(require|file|fileFn|env)(?:\(([~^]?[a-zA-Z\d._\-@/]+?)\))?(?::([a-zA-Z\d.]+?))?(?:, ([a-zA-Z\d=\-&/.:[\],]+?))?}/g
    ).exec(result);
    if (match) {
      const varsNew = {
        ...vars,
        ...(match[4] ? JSON
          .parse(`{"${match[4].replace(/&/g, '","').replace(/=/g, '":"')}"}`) : {})
      };

      let loaded;
      let newRelDir = relDir;
      if (['file', 'fileFn'].includes(match[1])) {
        const filePath = match[2].startsWith('^')
          ? path.join(relDir, match[2].substring(1))
          : path.join(dir, match[2]);
        newRelDir = path.dirname(filePath);
        loaded = (filePath.endsWith('.yml') || filePath.endsWith('.yaml'))
          ? yaml.safeLoad(fs.readFileSync(filePath, 'utf8'))
          // eslint-disable-next-line global-require, import/no-dynamic-require
          : require(filePath);
        if (match[1] === 'fileFn') {
          loaded = loaded(varsNew);
        }
      } else if (match[1] === 'env') {
        loaded = process.env;
      } else {
        // eslint-disable-next-line global-require, import/no-dynamic-require
        loaded = require(match[2]);
      }
      const target = match[3] ? get(loaded, match[3]) : loaded;
      result = loadRecursive(dir, newRelDir, typeof target === 'function' ? target() : target, varsNew);

      const beforeString = data.substring(0, match.index);
      const afterString = data.substring(match.index + match[0].length);
      if (beforeString.length > 0 || afterString.length > 0) {
        if (typeof result === 'string') {
          result = beforeString + result + afterString;
        } else {
          throw new TypeError(`Cannot combine string and ${typeof result}`);
        }
      }
    }
  }
  if (result instanceof Object) {
    const toMerge = get(result, '<<<', []).map((e) => loadRecursive(dir, relDir, e, vars));
    delete result['<<<'];
    Object.keys(result).forEach((key) => set(result, key, loadRecursive(dir, relDir, get(result, key), vars)));
    result = toMerge.reduce((prev, cur) => mergeWith(prev, cur, concatArrays), result);
  }
  return result;
};

module.exports.load = (filePath, vars = {}) => loadRecursive(
  path.dirname(filePath),
  path.dirname(filePath),
  yaml.safeLoad(fs.readFileSync(filePath, 'utf8')),
  vars
);

module.exports.dump = yaml.safeDump;
