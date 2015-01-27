var lang_nl = {
        	// output from the .po conversion
			locale_data : {
			    "lithophane" : {
			      "" : {
			        "domain" : "lithophane",
			        "lang"   : "nl",
			        "plural_forms" : "nplurals=2; plural=(n != 1);"
			      },
			      // no keys present in english, just dummy "some key" : [ "some value"]
		  		"Image to Lithophane": ["Foto naar Lithophane" ], 
			    },
			},
			"domain" : "lithophane",
		  	// This callback is called when a key is missing
		  	"missing_key_callback" : function(key) {
		    	// Do something with the missing key
		    	// e.g. send key to web service or
		    	return key;
		    	//console.error(key);
		  	},
        };
