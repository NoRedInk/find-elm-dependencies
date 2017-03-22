'use strict';

var _ = require("lodash");
var fs = require("fs");
var path = require("path");
var firstline = require("firstline");
var depsLoader = require('./src/dependencies.js');


function getBaseDir(file) {
  return firstline(file).then(function(line) {
    return new Promise(function(resolve, reject) {
      var matches = line.match(/^(?:port\s+)?module\s+([^\s]+)/);

      if (matches) {
        // e.g. Css.Declarations
        var moduleName = matches[1];

        // e.g. Css/Declarations
        var dependencyLogicalName = moduleName.replace(/\./g, "/");

        // e.g. ../..
        var backedOut = dependencyLogicalName.replace(/[^/]+/g, "..");

        // e.g. /..
        var trimmedBackedOut = backedOut.replace(/^../, "");

        return resolve(path.normalize(path.dirname(file) + trimmedBackedOut));
      } else if (!line.match(/^(?:port\s+)?module\s/)) {
        // Technically you're allowed to omit the module declaration for
        // beginner applications where it'd just be `module Main exposing (..)`
        // If there is no module declaration, we'll assume we have one of these,
        // and succeed with the file's directory itself.
        //
        // See https://github.com/rtfeldman/node-elm-compiler/pull/36

        return resolve(path.dirname(file));
      }

      return reject(file + " is not a syntactically valid Elm module. Try running elm-make on it manually to figure out what the problem is.");
    });
  });
}

// Returns a Promise that returns a flat list of all the Elm files the given
// Elm file depends on, based on the modules it loads via `import`.
function findAllDependencies(file, knownDependencies, baseDir, knownFiles) {
  if (!knownDependencies) {
    knownDependencies = [];
  }

  if (typeof knownFiles === "undefined"){
    knownFiles = [];
  } else if (knownFiles.indexOf(file) > -1){
    return knownDependencies;
  }

  if (baseDir) {
    return findAllDependenciesHelp(file, knownDependencies, baseDir, knownFiles).then(function(thing){
      return thing.knownDependencies;
    });
  } else {
    return getBaseDir(file).then(function(newBaseDir) {
      return findAllDependenciesHelp(file, knownDependencies, newBaseDir, knownFiles).then(function(thing){
        return thing.knownDependencies;
      });
    })
  }
}


function findAllDependenciesHelp(file, knownDependencies, baseDir, knownFiles) {
  return new Promise(function(resolve, reject) {
    // if we already know the file, return known deps since we won't learn anything
    if (knownFiles.indexOf(file) !== -1){
      return resolve({
        file: file,
        error: false,
        knownDependencies: knownDependencies
      });
    }
    // read the imports then parse each of them
    depsLoader.readImports(file).then(function(lines){
        // when lines is null, the file was not read so we just return what we know
        // and flag the error state
        if (lines === null){
          return resolve({
            file: file,
            error: true,
            knownDependencies: knownDependencies
          });
        }

        var newImports = _.compact(lines.map(function(line) {
          var matches = line.match(/^import\s+([^\s]+)/);

          // if the line is not actually an import line
          if (!matches) {
            return null;
          }

          // e.g. Css.Declarations
          var moduleName = matches[1];

          // e.g. Css/Declarations
          var dependencyLogicalName = moduleName.replace(/\./g, "/");

          // all non-native modules are .elm
          var extension = ".elm";
          // all native modules are .js
          if (moduleName.startsWith("Native.")){
            extension = ".js";
          }

          // e.g. ~/code/elm-css/src/Css/Declarations.elm
          var result = path.join(baseDir, dependencyLogicalName + extension);

          return _.includes(knownDependencies, result) ? null : result;

        }));

        knownFiles.push(file);

        var validDependencies = _.flatten(newImports);
        var newDependencies = knownDependencies.concat(validDependencies);
        var recursePromises = _.compact(validDependencies.map(function(dependency) {
          return path.extname(dependency) === ".elm" ?
            findAllDependenciesHelp(dependency, newDependencies, baseDir, knownFiles) : null;
        }));

        Promise.all(recursePromises).then(function(extraDependencies) {
          // keep track of files that weren't found in our src directory
          var externalPackageFiles = [];

          var justDeps = extraDependencies.map(function(thing){
            // if we had an error, we flag the file as a bad thing
            if (thing.error){
              externalPackageFiles.push(thing.file)
              return [];
            }
            return thing.knownDependencies;
          });

          var flat = _.uniq(_.flatten(knownDependencies.concat(justDeps))).filter(function(file){
            return externalPackageFiles.indexOf(file) === -1;
          });

          resolve({
            file: file,
            error: false,
            knownDependencies: flat
          });
        }).catch(reject);
    }).catch(reject);
  });
}

module.exports = {
  findAllDependencies: findAllDependencies
};
