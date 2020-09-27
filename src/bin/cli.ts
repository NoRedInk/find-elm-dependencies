#!/usr/bin/env node

import {findAllDependencies} from "../";

var entry = process.argv[2];

findAllDependencies(entry)
  .then(function (dependencies) {
    console.log(dependencies);
  });
