/*!
    ProtoJson - a json adaptation of Google's Protocol Buffers
    Copyright (C) 2011 Iván Montes <drslump@pollinimini.net>

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as
    published by the Free Software Foundation, either version 3 of the
    License, or (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

/**
 * ProtoJson runtime Javascript library
 *
 * @package     ProtoJson
 * @author      Iván -DrSlump- Montes <drslump@pollinimini.net>
 * @see         https://github.com/drslump/ProtoJson
 * @version     0.1
 *
 * @copyright  Copyright 2011, Iván -DrSlump- Montes
 * @license    Affero GPL v3 - http://opensource.org/licenses/agpl-v3
 */


/** 
 * Compatible with browser and CommonJS
 * @namespace 
 */
var ProtoJson = {};
if (typeof exports !== 'undefined') {
    ProtoJson = exports;
}

/**
 * Helper function to detect if a variable is an Array
 *
 * @static
 * @param o {object}
 * @return {boolean}
 */
ProtoJson.isArray = function(o){
    return typeof o === 'object'
           && Object.prototype.toString.call(o) === '[object Array]';
};

/**
 * Helper function to define new message objects
 *
 * @static
 * @param definition {Object} Hashmap of field definitions
 *      {
 *          fields: {
 *              number: [ name, flag, type, reference, default ],
 *              ...
 *          },
 *          ranges: [ min, max ],
 *          options: {
 *              optname: optvalue,
 *              ...
 *          }
 *      }
 *
 * @return {ProtoJson.Message} the new message object
 */
ProtoJson.create = function(definition){
    function ProtoJson_Message(data){
        if (typeof data !== 'undefined') {
            this.parse(data);
        }
    }

    ProtoJson_Message.constructor = ProtoJson_Message;
    ProtoJson_Message.prototype = new ProtoJson.Message();

    // Setup protojson meta information properties
    if (typeof definition['ranges'] === 'undefined')
        definition.ranges = [];
    if (typeof definition['options'] === 'undefined')
        definition.options = {};
    definition.unknown = {};

    // Store as a static property in the object
    ProtoJson_Message.prototype.__protojson = definition;

    // Generate the accessor methods in the prototype
    ProtoJson.generateAccessors(ProtoJson_Message, definition.fields);

    // Setup Extensions handler
    //ProtoJson_Message.prototype.extensions = new ProtoJson.Message.Extensions(ProtoJson_Message);

    return ProtoJson_Message;
};

/**
 * Extends a message object with extension field definitions
 *
 * @param message {ProtoJson.Message}
 * @param extensions {object}
 *          {
 *              number: [ name, flag, type, reference, default ],
 *              ...
 *          }
 */
ProtoJson.extend = function(message, extensions){
    var k, pj = message.prototype.__protojson;
    for (k in extensions) if (extensions.hasOwnProperty(k)) {
        pj.fields[k] = extensions[k];
    }

    ProtoJson.generateAccessors(message, extensions, true);
};

/**
 * Generate accessor and mutator methods for a Message
 *
 * Note: Methods are attached to the given object prototype.
 *
 * @param obj {ProtoJson.Message}
 * @param fields {object}
 * @param isExtension {boolean}
 */
ProtoJson.generateAccessors = function(obj, fields, isExtension){
    var k, proto = obj.prototype,
        prefix = isExtension ? 'Extension' : '';

    for (k in fields) if (fields.hasOwnProperty(k)) {
        (function(field){
            var name = field[0],
                uname = name.substr(0,1).toUpperCase() + name.substr(1);
            proto['get' + prefix + uname] = function(){ return this.get(name) };
            proto['set' + prefix + uname] = function(v){ this.set(name, v) };
            proto['has' + prefix + uname] = function(){ return this.has(name) };
            proto['clear' + prefix + uname] = function(){ return this.clear(name) };
            proto['add' + prefix + uname] = function(v){ this.add(name, v) };
        })(fields[k]);
    }
};


/**
 * @constructor
 * @memberOf {ProtoJson}
 */
ProtoJson.Message = function() {};

ProtoJson.Message.prototype = {
    /**
     * Exports the current message contents as a key value
     *
     * @param recurse {boolean} If true will export nested messages as plain objects too
     * @return {object}
     */
    exportAsObject: function(recurse){
        var k, name, result = {}, fields = this.__protojson.fields;
        for (k in fields) if (fields.hasOwnProperty(k)) {
            name = fields[k][0];
            if (this.has(name)) {
                result[name] = this.get(name);
                if (recurse && result[name] instanceof ProtoJson.Message) {
                    result[name] = this.exportAsObject(recurse);
                }
            }
        }
        return result;
    },

    /**
     * Imports a key value object into the message
     *
     * @todo Support importing sub-messages
     *
     * @param object {object}
     */
    importFromObject: function(object){
        var k;
        for (k in object) if (object.hasOwnProperty(k)) {
            this.set(k, object[k]);
        }
    },

    /**
     * Parse a ProtoJson structure in normal or compact (array) form
     *
     * @param data {Object|Array}
     */
    parse: function(data){
        if (ProtoJson.isArray(data)) {
            this.parseFromArray(data);
        } else if (typeof data === 'object') {
            this.parseFromObject(data);
        } else {
            throw new Error('Unsuitable data to parse');
        }
    },

    /**
     * Parse a ProtoJson compact structure or PbLite one
     *
     * @param array {Array}
     */
    parseFromArray: function(array){
        var i, dec, object = {};

        if (!array || !array.length) {
            throw new Error('Supplied data is empty');
        }

        // Detect PbLite format
        if (typeof array[0] === 'undefined' || array[0] === null) {
            for (i=1; i<array.length; i++) {
                if (typeof array[i] === 'undefined' || array[i] === null) {
                    object[i] = array[i];
                }
            }
        // Compact format with index
        } else if (typeof array[0] === 'string') {
            if (array[0].length !== array.length-1) {
                throw new Error('Index length does not match array length');
            }
            for (i=0; i<array[0].length; i++) {
                dec = array[0].charCodeAt(i) - 48;
                object[dec] = array[i+1];
            }
        } else {
            throw new Error('Unrecognized structure');
        }

        this.parseFromObject(object);
    },

    /**
     * Parse a ProtoJson structure
     *
     * @param object {Object}
     */
    parseFromObject: function(object){
        var k,
            fields = this.__protojson.fields;

        for (k in object) if (object.hasOwnProperty(k)) {
            if (typeof fields[k] !== 'undefined') {
                //@todo Check type of field to support sub-messages
                this.set(k, object[k]);
            } else {
                this.unknown(k, object[k]);
            }
        }
    },

    /**
     * Serialize a message into a ProtoJson structure
     *
     * @param compact {boolean} If true will generate the compact form
     * @return {Object|Array}
     */
    serialize: function(compact){
        return compact ? this.serializeAsArray() : this.serializeAsObject();
    },

    /**
     * Serialize a message into a ProtoJson compact structure
     *
     * @return {Array}
     */
    serializeAsArray: function(){
        function recursive(o){
            var k, i, subarr, index = '', result = [];

            for (k in o) if (o.hasOwnProperty(k)) {
                index += String.fromCharCode(parseInt(k) + 48);

                if (typeof o[k] === 'object') {
                    if (ProtoJson.isArray(o[k])) {
                        subarr = [];
                        for (i=0; i<o[k].length; i++) {
                            subarr.push(recursive(o[k][i]));
                        }
                        result.push(subarr);
                    } else {
                        result.push(recursive(o[k]));
                    }
                } else {
                    result.push(o[k]);
                }
            }

            result.unshift(index);
            return result;
        }

        return recursive(this.serializeAsObject());
    },

    /**
     * Serialize a message into a ProtoJson standard structure
     *
     * @todo Normalize data (numbers as strings, bools, etc)
     *
     * @return {Object}
     */
    serializeAsObject: function(){

        var k, name,
            result = {},
            fields = this.__protojson.fields;

        for (k in fields) if (fields.hasOwnProperty(k)) {
            name = fields[k][0];
            if (!this.hasOwnProperty(name) || typeof this[name] === 'undefined') {
                continue;
            }

            if (typeof this[name] === 'object') {
                if (ProtoJson.isArray(this[name])) {
                    result[k] = [];
                    for (var i=0; i<this[name].length; i++) {
                        result[k].push( this[name].serializeAsObject() );
                    }
                } else {
                    result[k] = this[name].serializeAsObject();
                }
            } else {
                result[k] = this[name];
            }
        }

        // Append unknown fields
        fields = this.__unknown__;
        for (k in fields) if (fields.hasOwnProperty(k)) {
            result[k] = fields[k];
        }

        return result;
    },

    /**
     * Serializes the message directly into a JSON string
     *
     * Requires an HTML5 compatible JSON global object to be available.
     *
     * @param compact {boolean} - Optional, if true will use the compact format (array+index)
     * @return {string} - A "JSON" string
     */
    serializeAsJson: function(compact){
        var result = compact ? this.serializeAsArray() : this.serializeAsObject();
        return JSON.stringify(result);
    },

    /**
     * Serializes the message following Google Closure's PbLite format.
     *
     * Requires an HTML5 compatible JSON global object to be available.
     *
     * @param compat {boolean} - Optional, use "null" instead of empty values
     * @return {string} - A "JSON" PbLite serialization of the message
     */
    serializeAsPbLite: function(compat){

        compat = compat ? 'null,' : ',';

        function recursive(obj){
            var k,
                last = 0,
                result = ['['];

            for (k in obj) if (obj.hasOwnProperty(k)) {
                result.push(last === 0 ? '' : ',');
                for (; last<k-1; last++) result.push(compat);
                last = k;

                result.push(
                        typeof obj[k] === 'object'
                        ? recursive(obj[k])
                        : JSON.stringify(obj[k])
                );
            }

            result.push(']');

            return result.join('');
        }

        return recursive(this.serializeAsObject());
    },

    // Private accessors and mutators for working with field numbers

    /**
     * Obtain the field value by its tag number
     *
     * @private
     * @param number {number}
     * @return {mixed}
     */
    get$: function(number){
        var fields = this.__protojson.fields;
        if (!fields[number]) return undefined;
        return this.get(fields[number][0]);
    },
    /**
     * Set a field value by its tag number
     *
     * @private
     * @param {number} number
     * @param {mixed} value
     */
    set$: function(number, value){
        var fields = this.__protojson.fields;
        fields[number] && this.set(fields[number][0], value);
    },
    /**
     * Check a field value by its tag number
     *
     * @private
     * @param {number} number
     * @return {boolean}
     */
    has$: function(number){
        var fields = this.__protojson.fields;
        return fields[number] && this.has(fields[number][0]);
    },
    /**
     * Clear a field value by its tag number
     *
     * @private
     * @param {number} number
     */
    clear$: function(number){
        var fields = this.__protojson.fields;
        fields[number] && this.clear(fields[number][0]);
    },
    /**
     * Adds an element to a field value by its tag number
     *
     * @private
     * @param {number} number
     * @param {mixed} value
     */
    add$: function(number, value){
        var fields = this.__protojson.fields;
        fields[number] && this.add(fields[number][0], value);
    },


    /**
     * Obtain the value of a field by its name
     *
     * @param field {string}
     * @return {mixed}
     */
    get: function(field){
        var fields = this.__protojson.fields;
        // Ensure we return an empty array for repeated items
        if (!this.has(field) && fields[field] && fields[field][1] === 3) {
            return [];
        }
        return this[field];
    },

    /**
     * Set the value of a field by its name
     *
     * @param field {string}
     * @param value {mixed}
     */
    set: function(field, value){
        this[field] = value;
    },

    /**
     * Clears the field value
     *
     * @param field
     */
    reset: function(field){
        if (this.has(field)) {
            this[field] = null;
            delete this[field];
        }
    },

    /**
     * Checks if a field has a value
     *
     * @param field {string}
     * @return {boolean}
     */
    has: function(field){
        return typeof this[field] !== 'undefined';
    },

    /**
     * Adds a value to a repeatable field (array) by its name
     *
     * @param field {string}
     * @param value {mixed}
     */
    add: function(field, value){
        this[field].push(value);
    },

    /**
     * Sets a value for an "unknown" field number
     *
     * @todo Do we need this?
     *
     * @param number {number}
     * @param value {mixed}
     */
    unknown: function(number, value){
        this.__unknown__[number] = value;
    }

};


////////////////////////////////////////////////////////////////- cutmark -//
//
// From this point the functionality is not needed for common use cases.
// You may want to remove it if you need to trim down the library size.
//
/////////////////////////////////////////////////////////////////////////////

/**
 * A DynamicMessage allows to define/construct messages at runtime
 *
 * @augments {ProtoJson.Message}
 * @extends ProtoJson.Message
 * @memberOf {ProtoJson}
 */
ProtoJson.DynamicMessage = ProtoJson.create({
    fields: {},
    ranges: [],
    options: {}
});

/**
 * @static
 * @enum {number}
 */
ProtoJson.DynamicMessage.FLAG = {
    OPTIONAL: 1,
    REQUIRED: 2,
    REPEATED: 3
};

/**
 * @static
 * @enum {number}
 */
ProtoJson.DynamicMessage.TYPE = {
    NUMBER: 1,
    BOOLEAN: 8,
    STRING: 9,
    MESSAGE: 11,
    BYTES: 12,
    ENUM: 14
};

/**
 * Define a new field in the message
 *
 * @param number {number|object}    If an object is give it should include key-value with the needed arguments
 * @param name {string}
 * @param type {number}
 * @param flag {number}
 * @param reference {string}
 * @param value {string}
 * @param options {object}
 */
ProtoJson.DynamicMessage.prototype.defineField = function(number, name, type, flag, reference, value, options){
    var def = typeof number === 'object' ? number : {};

    this.__protojson.fields[def.number || number] = [
        def.name || name,
        def.type || type,
        def.flag || flag,
        def.reference || reference,
        def.value || value,
        def.options || options
    ];
};

/**
 * Defines the extension range for the message
 *
 * @param min {number}
 * @param max {number}   If not given will default to 536870911
 */
ProtoJson.DynamicMessage.prototype.defineExtensionRange = function(min, max){
    max = max || 536870911;
    this.__protojson.ranges.push([min, max]);
};

/**
 * Defines an option for the message
 *
 * @param name {string}
 * @param value {string|number}
 */
ProtoJson.DynamicMessage.prototype.defineOption = function(name, value){
    this.__protojson.options[name] = value;
};


/**
 * Allows to inspect a message and find out details about it
 *
 * @constructor
 * @memberOf {ProtoJson}
 * @param message {string}
 */
ProtoJson.Inspect = function(message){
    var proto = message.__protojson || message.prototype.__protojson;

    function findField(numberOrName){
        if (parseInt(numberOrName) == numberOrName) {
            return proto.fields[numberOrName];
        }
        var k, fields = proto.fields;
        for (k in fields) if (fields.hasOwnPropert(k)) {
            if (fields[k][0] === numberOrName) {
                return fields[k];
            }
        }
        return null;
    }

    function isExtension(number){
        var i, ranges = proto.ranges;
        for (i=0; i<ranges.length; i++) {
            if (number >= ranges[i][0] && number <= ranges[i][1]) {
                return true;
            }
        }
        return false;
    }

    return {
        /**
         * Obtain the list of fields in this message
         *
         * @return {array.<ProtoJson.Inspect.Field>}
         */
        getFields: function(){
            var k, result = [],
                fields = proto.fields;

            for (k in fields) if (fields.hasOwnProperty(k)) {
                result.push(new ProtoJson.Inspect.Field(k, fields[k], isExtension(k)));
            }

            return result;
        },
        /**
         * Obtain a given field
         *
         * @param number {number}
         * @return {ProtoJson.Inspect.Field | null}
         */
        getField: function(number){
            var field = findField(number);
            if (!field) return null;
            // @todo Obtain field number if name is given
            return new ProtoJson.Inspect.Field(number, field, isExtension(number));
        },
        /**
         * Check if a given field exists
         *
         * @param number {number}
         * @return {boolean}
         */
        hasField: function(number){
            return findField(number) !== null;
        },

        /**
         * Obtain message options as a key-value object
         *
         * @return {object}
         */
        getOptions: function(){},
        /**
         * Obtain a message option by its name
         *
         * @param name {string}
         * @return {string}
         */
        getOption: function(name){},
        /**
         * Check if an option exists
         *
         * @param name {string}
         * @return {boolean}
         */
        hasOption: function(name){}
    };
};


/**
 * @constructor
 * @memberOf {ProtoJson}
 * @param number {number}
 * @param def {array}
 * @param isExtension {boolean}
 */
ProtoJson.Inspect.Field = function(number, def, isExtension){
    return {
        /**
         * Obtain field number or tag
         *
         * @return {number}
         */
        getNumber: function(){ return number; },
        /**
         * Obtain field name
         *
         * @return {string}
         */
        getName: function(){ return def[0]; },
        /**
         * Obtain field flag (1:Optional, 2:Required, 3:Repeated)
         *
         * @return {number}
         */
        getFlag: function(){ return def[1]; },
        /**
         * Obtain field type
         *
         * @return {number}
         */
        getType: function(){ return def[2]; },
        /**
         * Obtain field reference for message and enum types
         *
         * @return {string|null}
         */
        getReference: function(){ return def[3]; },
        /**
         * Obtain field default value
         *
         * @return {string|number}
         */
        getDefault: function(){ return def[4]; },

        /**
         * Checks if field is required
         *
         * @return {boolean}
         */
        isRequired: function(){ return def[1] === 2; },
        /**
         * Check if field is optional (or repeated)
         *
         * @return {boolean}
         */
        isOptional: function(){ return def[1] !== 2; },
        /**
         * Check if field is repeated
         *
         * @return {boolean}
         */
        isRepeated: function(){ return def[1] === 3; },
        /**
         * Check if field is an extension
         *
         * @return {boolean}
         */
        isExtension: function(){ return isExtension === true },

        /**
         * Obtain simplified field type as a string:
         *
         *  - number
         *  - boolean
         *  - string
         *  - message
         *  - enum
         *  - bytes
         *  - unknown
         *
         * @return {string}
         */
        getSimpleType: function(){
            switch (def[2]) {
                case 1: // Double
                case 2: // Float
                case 3: // Int64
                case 4: // UInt64
                case 5: // Int32
                case 6: // Fixed64
                case 7: // Fixed32
                case 13: // UInt32
                case 15: // SFixed32
                case 16: // SFixed64
                case 17: // SInt32
                case 18: // SInt64
                    return 'number';
                case 8: // Bool
                    return 'boolean';
                case 9: // String
                    return 'string';
                case 11: // Message
                    return 'message';
                case 12: // Bytes
                    return 'bytes';
                case 14: // Enum
                    return 'enum';

                case 10: // Group (deprecated)
                default:
                    return 'unknown';
            }
        },

        /**
         * Obtain field options as a key-value object
         *
         * @return {object}
         */
        getOptions: function(){ return def[5] || {}; },
        /**
         * Obtain a field option by its name
         *
         * @param name {string}
         * @return {string|null}
         */
        getOption: function(name){
            return this.hasOption(name) ? this.getOptions()[name] : null;
        },
        /**
         * Check if an option exists
         *
         * @param name {string}
         * @return {boolean}
         */
        hasOption: function(name){
            var opts = def[5] || {};
            return typeof opts[name] !== 'undefined';
        }
    };
};

