ProtoJson
=========

A Javascript library for Google's Protocol Buffers _messages_ using a
custom JSON based syntax instead of the original binary protocol.

Parsing binary data in a web browser is difficult and slow. Javascript
does not have a _binary_ data type, so even with modern heavily optimized
javascript engines, parsing and serializing to PB's binary format is
slow. On the other hand, recent browser versions include native support
for JSON messages thus making its use very fast.

By porting some of Protocol Buffers size optimization mechanisms to a
JSON compatible format, ProtoJson can considerably reduce the size of
a tipical hashmap style JSON message. Besides, it leverages the code
generation step to produce compact javascript files describing the
messages in the .proto files, generating accessor and muttator methods
to aide with code completion (not needed at runtime).


## Supported formats

The library understands three different _formats_, all based on JSON.

  * Hashmap: A tipical JSON message, with key:value pairs where the
    key is a string representing the field name.

  * Tagmap: Very similar to Hashmap, but instead of having the field
    name as key it has the field tag number as defined in the proto
    definition. This can save much space when tranferring the messages,
    since usually field names are longer than numbers.

  * Indexed: Takes the Tagmap format a further step and optimizes the
    size needed for tag numbers by packing all of them as a string, where
    each character represents a tag, and placing it as the first element
    of an array.


Note that even though some JSON parser will be able to produce valid results
when "keys" in an object are numbers intead of strings, it's not valid
JSON syntax, and as such it could produce problems and hard to find bugs.
So, even if we could squeeze a few more bytes we strive to produce 100%
standard JSON syntax.

The Javascript implementation of ProtoJson does allow nested messages
to use a different format than its containing message. However, not all
implementations of ProtoJson support this behaviour. Unless you're
certain that they do it's better to always use the same format across all
nested messages.


### Mapping beween PB wire types and ProtoJson

     PB                     | ProtoJson
    ---------------------------------------
     varint                 |
        int                 | Number
        bool                | 0 / 1
        enum                | Number
     Length-delimited       |
        string              | String
        binary              | (Not supported)
        embedded messages   | Object/Array
        repeated fields     | Array
     Fixed64 / Double       | Number
     Fixed32 / Float        | Number


> Please note that when transfering very big number values, there might be
differences between number precision according to Protocol Buffers and
the native number types in Javascript. The library does not take these
differences into account, so it's up to you to control them if your
aplication needs it.


## Examples

Given the following message definition:

    message Person {
      required string name = 1;
      required int32 id = 2;
      optional string email = 3;

      enum PhoneType {
        MOBILE = 0;
        HOME = 1;
        WORK = 2;
      }

      message PhoneNumber {
        required string number = 1;
        optional PhoneType type = 2 [default = HOME];
      }

      repeated PhoneNumber phone = 4;

      repeated string friends = 5;
    }

It'd be repressented as the following with each supported format:

    // HashMap (133 bytes - 100%)
    {
      "name": "Iván",
      "id": 2351,
      "email": "drslump@pollinimini.net",
      "phone": [
        {
          "number": "555-123-123",
          "type": 1
        }
      ],
      "friends": [ "orestes", "juan" ]
    }

    // TagMap (107 bytes - 80%)
    {
        "1": "Iván",
        "2": 2351,
        "3": "drslump@pollinimini.net",
        "4": [
          {
            "1": "555-123-123",
            "2": 1
          }
        ],
        "5": [ "orestes", "juan" ]
    }

    // Indexed (92 bytes - 69%)
    ["12345",
      "Iván",
      2351,
      "drslump@pollinimini.net",
      [
        ["12",
          "555-123-123",
          1
        ]
      ],
      [ "orestes", "juan" ]
    ]



## How the index is computed

The index is computed so that it is space efficient while still being
easy to inspect for most common cases. Each "character" in the string
index represents a field number, to calculate the field number of the
first value in the message the following operation can be used:

    dec = ord(index[0])
    num = dec - 48

The inverse operation would be:

    dec = num + 48
    index[0] = chr(dec)

Since most JSON implementations encode strings as UTF-8 we try to use
characters in the "printable" ASCII range starting at code 48 ("0"), this
makes common lower numbers (1-9) have the same representation in the index
as characters.

Field numbers over 79 (end up being a charcode over 127) will be encoded
as multibyte UTF-8 characters, which might result being serialized in JSON
strings as "\uXXXX" (depends on the library used), which is not as space
efficient, however it's also important to have a simple and fast encoding
and decoding routines and using a single character for each element does
simplify those routines a lot, specially in Javascript.

Please take into account that UTF-8's maximum code point is 0x10FFFF
(1.114.111 in decimal), thus field numbers greater than that cannot be used
in the index, meaning that those messages should be encoded using the
_tagmap_ or _hashmap_ formats. Moreover, JSON specifies that code points
above 0xFFFF are to be encoded as an UTF-16 surrogate pair, taking twelve
bytes to represent it. This means that when defining your tag numbers it's
important to define them with numbers below 0xFFFF (65535 in decimal) to
make the index more space efficient.

Note that there is no need to order the fields included in the message, the
index will map each element in the array to its corresponding field number.


### Example index encoding and decoding in javascript:

    var index, message = [];
    for (var k in hashmap) {
        var chr = String.fromCharCode(parseInt(k) + 48);
        index += chr;
        message.push(hashmap[k]);
    }
    message.unshift(index);

    var hashmap = {};
    var message = ["1238G","1","2","3","8","G"];
    for (var i=0; i<message[0].length; i++) {
        var dec = message[0].charCodeAt(i);
        dec -= 48;

        hashmap['' + dec] = message[i+1];
    }


## Compatible implementations

### Ruby

 * [ProtoJson4Ruby](https://github.com/juandebravo/ProtoJSON4Ruby) by [Juan de Bravo](https://github.com/juandebravo)

### Java

 * [ProtoJson](https://github.com/miceno/ProtoJson/tree/orestes) by [Miceno](https://github.com/miceno)

### PHP

 * [Protobuf-PHP](https://github.com/drslump/Protobuf-PHP) by myself



## Other similar implementations: PbLite

After having the implementation in place and deciding a name for the project,
a quick search on google for that name to check if there were other projects
using it, revealed that a similar solution was already implemented by Google
for its Closure library.

They call the JSON serialization format "PbLite" and it follows the array
idea but without using an index, extrapolating the element tag number from
its position in the array:

    [,"number1",,"number3",,,"number6"]

Depending on the tag numbers used for the messages it will offer a pretty
good space efficient serialization. Although I still think that the Index
based approach offers similar results and will not choke on messages with
high field numbers, like when using extensions.

We won't support this format though, even if it could be really simple to
implement. The syntax used by PbLite does not conform to JSON's RFC, an
array is composed of `[ value *( value-separator value ) ]`, some libraries
seem to be able to parse it though, however they replace the undefined
elements with `null` values. Other parsers will not be able to parse this
kind of JSON derivative, needing to pre-process it to convert undefineds
into `nulls` before using it. So for it to be a more effective alternative
to the _Indexed_ format, we would have to process the result of a
standard JSON implementation, which would slow down the whole process just
to save a couple of bytes.

### Links

 - http://code.google.com/p/closure-library/source/browse/trunk/closure/goog/proto2/
 - https://groups.google.com/group/closure-library-discuss/browse_thread/thread/fc4446a2a61c28ee?fwc=1
 - https://github.com/ludios/Protojson

