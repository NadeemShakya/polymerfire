import firebase from "@firebase/app";
import "@polymer/polymer/polymer-legacy.js";
import { Polymer } from "@polymer/polymer/lib/legacy/polymer-fn.js";
import { FirebaseFirestoreDocumentBehavior } from "./firebase-firestore-document-behavior";

/**
 * The firebase-firestore-document element is an easy way to interact with a firestore
 * location as an object and expose it to the Polymer databinding system.
 *
 * For example:
 *
 *     <firebase-firestore-document
 *       path="/users/[[userId]]/notes/[[noteId]]"
 *       data="{{noteData}}">
 *     </firebase-firestore-document>
 *
 * This fetches the `noteData` object from the firebase location at
 * `/users/${userId}/notes/${noteId}` and exposes it to the Polymer
 * databinding system. Changes to `noteData` will likewise be, sent back up
 * and stored.
 *
 * `<firebase-firestore-document>` needs some information about how to talk to Firebase.
 * Set this configuration by adding a `<firebase-app>` element anywhere in your
 * app.
 */
Polymer({
  is: "fs-document",

  behaviors: [FirebaseFirestoreDocumentBehavior],

  attached: function () {
    this.__needSetData = true;
    this.__refChanged(this.ref, this.ref);
  },

  detached: function () {
    if (this._unsubscribe) {
      this._unsubscribe();
    }
  },

  get isNew() {
    return this.disabled || !this.__pathReady(this.path);
  },

  get zeroValue() {
    return {};
  },

  /**
   * Update the path and write this.data to that new location.
   *
   * Important note: `this.path` is updated asynchronously.
   *
   * @param {string} parentPath The new firebase location to write to.
   * @param {string=} key The key within the parentPath to write `data` to. If
   *     not given, a random key will be generated and used.
   * @return {Promise} A promise that resolves once this.data has been
   *     written to the new path.
   *
   */
  saveValue: function (parentPath, key, comparision = true) {
    return new Promise(
      function (resolve, reject) {
        var path = null;
        if (!this.app) {
          reject(new Error("No app configured!"));
        }

        if (!comparision && key) {
          firebase
            .firestore(this.app)
            .collection(parentPath)
            .doc(key)
            .set(this.data)
            .then((content) => {
              resolve(true);
            })
            .catch((error) => reject(error));
        } else if (key) {
          path = parentPath + "/" + key;
          resolve(this._setFirebaseValue(path, this.data));
        } else {
          firebase
            .firestore(this.app)
            .collection(parentPath)
            .add(this.data)
            .then((content) => {
              path = content.path.toString();
              resolve(true);
            })
            .catch((error) => reject(error));
        }

        this.path = path;
      }.bind(this)
    );
  },

  reset: function () {
    this.path = null;
    return Promise.resolve();
  },

  deleteStoredValue: function (path) {
    return new Promise(
      function (resolve, reject) {
        this.db
          .doc(path)
          .delete()
          .then(() => resolve(true))
          .catch((err) => reject(err));
      }.bind(this)
    );
  },

  destroy: function () {
    return this._setFirebaseValue(this.path, null).then(
      function () {
        return this.reset();
      }.bind(this)
    );
  },

  memoryPathToStoragePath: function (path) {
    var storagePath = this.path;

    if (path !== "data") {
      storagePath += path
        .replace(/^data\.?/, "/")
        .split(".")
        .join("/");
    }

    return storagePath;
  },

  storagePathToMemoryPath: function (storagePath) {
    var path = "data";

    storagePath = storagePath.replace(this.path, "").split("/").join(".");

    if (storagePath) {
      path += "." + storagePath;
    }

    return path;
  },

  getStoredValue: function (path) {
    return new Promise(
      function (resolve, reject) {
        this.db
          .doc(path)
          .get()
          .then((snapshot) => {
            var value = snapshot.data();
            if (value == null) {
              resolve(this.zeroValue);
            }
            resolve(value);
          })
          .catch(this.__onError);
      }.bind(this)
    );
  },
  setStoredValue: function (path, value) {
    return this._setFirebaseValue(path, value);
  },

  __refChanged: function (ref, oldRef) {
    if (oldRef) {
      //        oldRef.off('value', this.__onFirebaseValue, this);
      try {
        this.get("_unsubscribe")();
      } catch (e) {
        // console.error(e);
      }
    }

    if (ref) {
      this.set(
        "_unsubscribe",
        ref.onSnapshot(
          this.__onFirebaseValue.bind(this),
          this.__onError.bind(this)
        )
      );
      //        ref.on('value', this.__onFirebaseValue, this.__onError, this);
    }
  },

  __onFirebaseValue: function (snapshot) {
    var value = snapshot.data();

    if (value == null) {
      value = this.zeroValue;
      this.__needSetData = true;
    }

    if (!this.isNew) {
      this.async(function () {
        this.syncToMemory(function () {
          this._log("Updating data from Firebase value:", value);

          // set the value if:
          // it is the first time we run this (or the path has changed and we are back with zeroValue)
          // or if  this.data does not exist
          // or value is primitive
          // or if firebase value obj contain less keys than this.data (https://github.com/Polymer/polymer/issues/2565)
          if (
            this.__needSetData ||
            !this.data ||
            typeof value !== "object" ||
            Object.keys(value).length < Object.keys(this.data).length
          ) {
            this.__needSetData = false;
            return this.set("data", value);
          }

          // now, we loop over keys
          for (var prop in value) {
            if (value[prop] !== this.data[prop]) {
              this.set(["data", prop], value[prop]);
            }
          }
        });
      });
    }
  },
});
