let assert = require('assert');
let _ = require('lodash');
let log = require('engine/log')();
let Zip = require('node-zip');

// we create fake plunk ids with this prefix
// so that when updating for real, we know they do not exist and don't send updates to https://plnkr.co server
const DEV_PREFIX = '_[stub]_';

let request = require('request-promise').defaults({
  simple: false,
  resolveWithFullResponse: true
});


module.exports = class TutorialView {
  constructor(data) {
    'description,webPath,plunkId,files'.split(',').forEach(field => {
      if (field in data) {
        this[field] = data[field];
      }
    });
    if (!this.files) {
      this.files = [];
    }
  }

  getUrl() {
    if (this.plunkId) {
      return 'https://plnkr.co/edit/' + this.plunkId + '?p=preview';
    } else {
      return null;
    }
  }

  getZip() {
    let archive = new Zip();

    for (let file of this.files) {
      archive.file(file.filename, file.content);
    }

    let buffer = archive.generate({type: 'nodebuffer'});

    return buffer;
  };

  async mergeAndSyncPlunk(files, plunkerToken) {

    let changes = {};

    log.debug("mergeAndSyncRemote " + this.plunkId);
    log.debug("OLD files", this.files);
    log.debug("NEW files", files);

    /* delete this.files which are absent in files */
    for (let i = 0; i < this.files.length; i++) {
      let file = this.files[i];
      if (!files[file.filename]) {
        this.files.splice(i--, 1);
        changes[file.filename] = null; // for submitting to plnkr
      }
    }

    for (let name in files) {
      let existingFile = null;
      for (let i = 0; i < this.files.length; i++) {
        let item = this.files[i];
        if (item.filename == name) {
          existingFile = item;
          break;
        }
      }
      if (existingFile) {
        if (existingFile.content == files[name].content) continue;
        existingFile.content = files[name].content;
      } else {
        this.files.push(files[name]);
      }
      changes[name] = files[name];
    }

    log.debug("UPDATED files", this.files);

    if (_.isEmpty(changes) && !this.plunkId.startsWith(DEV_PREFIX)) {
      log.debug("no changes, skip updating");
      return;
    } else {
      log.debug("plunk " + this.plunkId + " changes", changes);
    }

    // if (this.plunkId && !this.plunkId.startsWith(DEV_PREFIX)) {
    //   log.debug("update remotely", this.webPath, this.plunkId);
    //   await this.updatePlunk(this.plunkId, changes, plunkerToken);
    // } else {
    log.debug("create plunk remotely", this.webPath);
    this.plunkId = await this.createPlunk(this.description, this.files, plunkerToken);
    // }

    // console.error("TEST PLUNK UPLOAD")
    // process.exit(1);
  }

  async createPlunk(description, files, plunkerToken) {

    if (!process.env.PLNKR_ENABLED) {
      return DEV_PREFIX + Math.random().toString(36).slice(2);
    }

    let filesObj = {};
    files.forEach(function (file) {
      filesObj[file.filename] = {
        filename: file.filename,
        content: file.content
      }; // no _id
    });

    let form = {
      description: description,
      tags: [],
      files: filesObj,
      private: true
    };


    /*  let j = request.jar();
      let cookie = request.cookie('plnk_session');
      cookie.value = plunkerToken;
      j.setCookie(cookie, "http://api.plnkr.co");
    */
    let data = {
      method: 'POST',
      headers: {'Content-Type': 'application/json;charset=utf-8'},
      json: true,
      url: "http://api.plnkr.co/plunks/?sessid=" + plunkerToken,
      body: form
    };


    log.debug("plunk createRemote", data);

    let result = await this.requestPlunk(data);

    log.debug("plunk createdRemote", result.body);

    assert.strictEqual(result.statusCode, 201);

    return result.body.id;

  };

  async requestPlunk(data) {
    let result = await request(data);

    if (result.statusCode == 404) {
      throw new Error("result " + data.url + " status code 404, probably (plnkrAuthId is too old OR this plunk doesn't belong to plunk@javascript.ru (javascript-plunk) user)");
    }
    if (result.statusCode == 400) {
      throw new Error("invalid json, probably you don't need to stringify body (request will do it)");
    }

    return result;
  };

  async updatePlunk(plunkId, changes, plunkerToken) {

    if (!process.env.PLNKR_ENABLED) {
      return;
    }

    let form = {
      files: changes
    };

    let options = {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      json: true,
      url: "http://api.plnkr.co/plunks/" + plunkId + "?sessid=" + plunkerToken,
      body: form
    };

    log.debug(options);

    let result = await this.requestPlunk(options);

    assert.strictEqual(result.statusCode, 200);
  };

};
