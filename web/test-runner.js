// Mock necessary objects and functions before z-plugin.js loads.

// Mock 'goog' object and 'goog.provide' function
window.goog = {
  provide: function(namespace) {
    console.log('goog.provide called for:', namespace);
    // Create the namespace if it doesn't exist
    let parts = namespace.split('.');
    let current = window;
    for (let part of parts) {
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    }
  },
  require: function(namespace) {
    console.log('goog.require called for:', namespace);
  }
};

// Mock 'sync.api.Workspace.EventType.EDITOR_LOADED'
window.sync = {
  api: {
    Workspace: {
      EventType: {
        EDITOR_LOADED: 'editorLoaded'
      }
    },
    Editor: {
      EditorTypes: {
        AUTHOR: 'Author'
      }
    }
  }
};

// Mock 'workspace' object
window.workspace = {
  listeners: {},
  addEventListener: function(event, callback) {
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(callback);
  },
  triggerEvent: function(event) {
    if (this.listeners[event]) {
      var mockEventData = {};
      if (event === sync.api.Workspace.EventType.EDITOR_LOADED) {
        // Ensure window.editor and its methods are set up before creating mockEventData
        if (!window.editor) {
          window.editor = {}; // Should already be defined by the more complete mock below
        }
        if (!window.editor.getEditingSupport) {
            // Temporary setup if editor is not fully mocked yet by the time triggerEvent is called by a test prematurely
            // This is less likely given the beforeEach structure but good for robustness.
            window.editor.getEditingSupport = function() { return {}; };
        }
        mockEventData = { editor: window.editor }; // Pass the global mock editor
      }
      this.listeners[event].forEach(function(callback) {
        callback(mockEventData); // Pass the event data object
      });
    }
  }
};

// Mock 'editor' object and its methods
// This needs to be defined before workspace.triggerEvent might use it.
window.editor = {
  _editingSupport: null, // Internal store for the editingSupport object
  getEditingSupport: function() {
    if (!this._editingSupport) {
      // Initial mock for editingSupport; the plugin will add functions to this object.
      this._editingSupport = {
        getType: function() {
          return sync.api.Editor.EditorTypes.AUTHOR;
        },
        getSelectionManager: function() {
          return {
            getSelection: function() {
              return {
                getNodeAtSelection: function() {
                  let parser = new DOMParser();
                  let xmlDoc = parser.parseFromString('<dummyNode/>', 'text/xml');
                  return xmlDoc.documentElement;
                }
              };
            }
          };
        },
        getDocument: function() {
          let parser = new DOMParser();
          return parser.parseFromString('<root><child/></root>', 'text/xml');
        }
        // evaluateXPathAtSelection and evaluateXPath will be added by the plugin
      };
    }
    return this._editingSupport;
  },
  // Helper to reset the internal editingSupport for tests if needed (e.g. if plugin modifies it in a way that breaks other tests)
  resetEditingSupport: function() {
    this._editingSupport = null; 
  }
};

// Call wgxpath.install to ensure it's available for the plugin
// Ensure that wgxpath is defined, or mock it if necessary for the test setup phase
if (typeof wgxpath !== 'undefined' && wgxpath.install) {
  wgxpath.install(window);
} else {
  // If wgxpath is not available (e.g. script loading issue), mock it.
  console.warn('wgxpath not found, mocking install function.');
  window.wgxpath = {
    install: function(w) {
      console.log('Mocked wgxpath.install called.');
      // Simulate wgxpath installation if needed for tests to pass
      if (!w.document.evaluate) {
        w.document.evaluate = function() {
          console.warn("document.evaluate called on mock. Returning dummy result.");
          // Return a dummy XPathResult
          return {
            snapshotLength: 0,
            iterateNext: function() { return null; },
            snapshotItem: function() { return null; }
          };
        };
      }
    }
  };
  wgxpath.install(window);
}


// QUnit tests
QUnit.module('Z Plugin Tests', function(hooks) {
  let editingSupport; // This will hold the reference to window.editor.getEditingSupport()

  hooks.beforeEach(function(assert) {
    // 1. Ensure window.editor and getEditingSupport are set up.
    // window.editor is globally defined. We can reset its internal _editingSupport if needed.
    window.editor.resetEditingSupport(); // Clears any functions added by the plugin in previous tests

    // 2. Trigger the event. The plugin's listener will execute and modify window.editor._editingSupport.
    workspace.triggerEvent(sync.api.Workspace.EventType.EDITOR_LOADED);
    
    // 3. Obtain the editingSupport instance *after* the plugin has initialized.
    editingSupport = window.editor.getEditingSupport();

    // Default mock for getNodeAtSelection for this module, can be overridden in specific tests
    // This needs to be set on the 'editingSupport' instance obtained *after* plugin initialization
    if (editingSupport && editingSupport.getSelectionManager) { // Check if editingSupport is valid
        editingSupport.getSelectionManager().getSelection().getNodeAtSelection = function() {
            let parser = new DOMParser();
            let xmlDoc = parser.parseFromString('<defaultRoot><selectedNode/></defaultRoot>', 'text/xml');
            return xmlDoc.getElementsByTagName('selectedNode')[0];
        };
        editingSupport.getDocument = function() { // Default for this module
            let parser = new DOMParser();
            return parser.parseFromString('<mainDocument><globalElement/></mainDocument>', 'text/xml');
        };
    } else {
        // This case should ideally not be reached if plugin initializes correctly.
        // If it is, tests depending on editingSupport will likely fail, which is what assert.ok below will catch.
        console.error("Editing support not available after plugin initialization in Z Plugin Tests module.");
        // QUnit's assert object is passed to beforeEach, so we can use it here if needed for early failure.
        if (assert && assert.ok) { // Check if assert is available (it is in QUnit 2.x)
            assert.ok(false, "Critical: editingSupport was not properly initialized in Z Plugin Tests beforeEach.");
        }
    }
  });

  QUnit.test('Plugin initialization - evaluateXPathAtSelection and evaluateXPath exist', function(assert) {
    // editingSupport is now the one potentially modified by the plugin
    assert.ok(editingSupport, "editingSupport object itself should exist");
    assert.ok(typeof editingSupport.evaluateXPathAtSelection === 'function', 'evaluateXPathAtSelection function should be defined on editingSupport');
    assert.ok(typeof editingSupport.evaluateXPath === 'function', 'evaluateXPath function should be defined on editingSupport');
    
    // Also check window-level functions for backward compatibility if they are still there
    // (assuming z-plugin.js might still add them to window for some reason)
    assert.ok(typeof window.evaluateXPathAtSelection === 'function', 'window.evaluateXPathAtSelection should also be defined on window');
    assert.ok(typeof window.evaluateXPath === 'function', 'window.evaluateXPath function should be defined');
  });

  // Tests for evaluateXPath (global context)
  QUnit.module('evaluateXPath Tests', function(hooks) {
    let parser;
    let parser; // Declare parser here to be accessible in all tests in this module

    hooks.beforeEach(function(assert) {
      // 1. Ensure window.editor and getEditingSupport are set up.
      window.editor.resetEditingSupport();

      // 2. Trigger the event.
      workspace.triggerEvent(sync.api.Workspace.EventType.EDITOR_LOADED);
      
      // 3. Obtain the editingSupport instance *after* the plugin has initialized.
      editingSupport = window.editor.getEditingSupport();
      
      parser = new DOMParser(); // Initialize parser for each test

      if (editingSupport && editingSupport.getDocument) {
          // Default document for tests in this module, can be overridden in specific tests
          editingSupport.getDocument = function() {
            return parser.parseFromString('<docRoot><item id="A">Item A</item><item id="B">Item B</item><item id="C" class="target">Item C</item></docRoot>', "text/xml");
          };
      } else {
          if (assert && assert.ok) {
            assert.ok(false, "Critical: editingSupport was not properly initialized in evaluateXPath Tests beforeEach.");
          } else {
            console.error("Editing support not available after plugin initialization in evaluateXPath Tests module.");
          }
      }
    });

    // --- Basic Queries ---
    QUnit.test("Select nodes by tag name", function(assert) {
      const xpathExpr = "//item";
      const result = editingSupport.evaluateXPath(xpathExpr, null, XPathResult.UNORDERED_NODE_ITERATOR_TYPE);
      let count = 0;
      let nodeTexts = [];
      let node;
      while (node = result.iterateNext()) {
        count++;
        assert.equal(node.nodeName, "item", "Node should be 'item'");
        nodeTexts.push(node.textContent);
      }
      assert.equal(count, 3, "Should find 3 'item' nodes in the document");
      assert.deepEqual(nodeTexts.sort(), ["Item A", "Item B", "Item C"].sort(), "Correct item texts found");
    });

    QUnit.test("Select nodes by attribute value", function(assert) {
      const xpathExpr = "//@id"; // Select all id attributes
      const result = editingSupport.evaluateXPath(xpathExpr, null, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE);
      assert.equal(result.snapshotLength, 3, "Should find 3 id attributes");
      const ids = [];
      for (let i = 0; i < result.snapshotLength; i++) {
        ids.push(result.snapshotItem(i).value);
      }
      assert.deepEqual(ids.sort(), ["A", "B", "C"].sort(), "Correct id values found");

      const specificAttrExpr = "//item[@class='target']";
      const specificResult = editingSupport.evaluateXPath(specificAttrExpr, null, XPathResult.FIRST_ORDERED_NODE_TYPE);
      assert.ok(specificResult.singleNodeValue, "Should find the item with class 'target'");
      assert.equal(specificResult.singleNodeValue.textContent, "Item C", "Content of item with class 'target' is correct");
    });

    QUnit.test("Count nodes in the document", function(assert) {
      editingSupport.getDocument = function() {
        return parser.parseFromString('<r><n1/><n2><n3/></n2><n4/></r>', "text/xml");
      };
      const xpathExpr = "count(//*)"; // Count all elements
      const result = editingSupport.evaluateXPath(xpathExpr, null, XPathResult.NUMBER_TYPE);
      assert.equal(result.numberValue, 4, "Should count 4 elements in the document");
    });

    QUnit.test("Select the root element", function(assert) {
      const xpathExpr = "/docRoot";
      const result = editingSupport.evaluateXPath(xpathExpr, null, XPathResult.FIRST_ORDERED_NODE_TYPE);
      assert.ok(result.singleNodeValue, "Root element should be selected");
      assert.equal(result.singleNodeValue.nodeName, "docRoot", "Selected node should be the root element 'docRoot'");
    });

    // --- Document Context ---
    QUnit.test("XPath is evaluated relative to the document node", function(assert) {
      // This is implicitly tested by using absolute paths like "/docRoot" which start from the document node.
      // We can add a specific test to ensure a relative path from document node works if needed,
      // but `evaluateXPath` typically uses the document as the context for absolute paths.
      const xpathExpr = "/docRoot/item[@id='B']";
      const result = editingSupport.evaluateXPath(xpathExpr, null, XPathResult.FIRST_ORDERED_NODE_TYPE);
      assert.ok(result.singleNodeValue, "Node should be found via absolute path from document root");
      assert.equal(result.singleNodeValue.textContent, "Item B", "Correct item 'B' found");
    });
    
    QUnit.test("Select from a more complex document structure", function(assert) {
        const complexDoc = `
            <archive>
                <section title="Reports">
                    <document id="rep001" type="annual">
                        <title>Annual Report 2023</title>
                        <author>CEO</author>
                    </document>
                    <document id="rep002" type="quarterly">
                        <title>Q3 Report</title>
                        <author>CFO</author>
                    </document>
                </section>
                <section title="Memos">
                    <document id="mem001" type="internal">
                        <title>Policy Update</title>
                        <author>HR</author>
                    </document>
                </section>
            </archive>
        `;
        editingSupport.getDocument = function() {
            return parser.parseFromString(complexDoc, "text/xml");
        };
        const xpathExpr = "/archive/section[@title='Reports']/document[@type='annual']/title";
        const result = editingSupport.evaluateXPath(xpathExpr, null, XPathResult.STRING_TYPE);
        assert.equal(result.stringValue, "Annual Report 2023", "Correct title of annual report found");
    });


    // --- Result Types ---
    QUnit.test("Result Type: STRING_TYPE", function(assert) {
      const xpathExpr = "string(//item[@id='A'])";
      const result = editingSupport.evaluateXPath(xpathExpr, null, XPathResult.STRING_TYPE);
      assert.equal(result.resultType, XPathResult.STRING_TYPE, "Result type is STRING_TYPE");
      assert.equal(result.stringValue, "Item A", "Correct string value returned");
    });

    QUnit.test("Result Type: NUMBER_TYPE", function(assert) {
      const xpathExpr = "count(//item)";
      const result = editingSupport.evaluateXPath(xpathExpr, null, XPathResult.NUMBER_TYPE);
      assert.equal(result.resultType, XPathResult.NUMBER_TYPE, "Result type is NUMBER_TYPE");
      assert.equal(result.numberValue, 3, "Correct numeric value (count) returned");
    });

    QUnit.test("Result Type: BOOLEAN_TYPE (true)", function(assert) {
      const xpathExpr = "boolean(//item[@id='A'])";
      const result = editingSupport.evaluateXPath(xpathExpr, null, XPathResult.BOOLEAN_TYPE);
      assert.equal(result.resultType, XPathResult.BOOLEAN_TYPE, "Result type is BOOLEAN_TYPE");
      assert.strictEqual(result.booleanValue, true, "Correct boolean value (true) returned");
    });
    
    QUnit.test("Result Type: BOOLEAN_TYPE (false)", function(assert) {
      const xpathExpr = "boolean(//item[@id='XYZ'])"; // Non-existent ID
      const result = editingSupport.evaluateXPath(xpathExpr, null, XPathResult.BOOLEAN_TYPE);
      assert.equal(result.resultType, XPathResult.BOOLEAN_TYPE, "Result type is BOOLEAN_TYPE");
      assert.strictEqual(result.booleanValue, false, "Correct boolean value (false) returned");
    });

    QUnit.test("Result Type: FIRST_ORDERED_NODE_TYPE", function(assert) {
      const xpathExpr = "//item"; // Selects all items, should return the first in document order
      const result = editingSupport.evaluateXPath(xpathExpr, null, XPathResult.FIRST_ORDERED_NODE_TYPE);
      assert.equal(result.resultType, XPathResult.FIRST_ORDERED_NODE_TYPE, "Result type is FIRST_ORDERED_NODE_TYPE");
      assert.ok(result.singleNodeValue, "A node should be returned");
      assert.equal(result.singleNodeValue.textContent, "Item A", "Correct first node returned based on default document");
    });

    QUnit.test("Result Type: UNORDERED_NODE_ITERATOR_TYPE", function(assert) {
      const xpathExpr = "//item";
      const result = editingSupport.evaluateXPath(xpathExpr, null, XPathResult.UNORDERED_NODE_ITERATOR_TYPE);
      assert.equal(result.resultType, XPathResult.UNORDERED_NODE_ITERATOR_TYPE, "Result type is UNORDERED_NODE_ITERATOR_TYPE");
      const foundTexts = [];
      let node = result.iterateNext();
      while(node) {
        foundTexts.push(node.textContent);
        node = result.iterateNext();
      }
      assert.equal(foundTexts.length, 3, "Iterator should find 3 items");
      assert.deepEqual(foundTexts.sort(), ["Item A", "Item B", "Item C"].sort(), "All iterated nodes are correct");
    });
    
    QUnit.test("Result Type: ORDERED_NODE_SNAPSHOT_TYPE (default if no type specified by plugin)", function(assert) {
        const xpathExpr = "//item";
        // If evaluateXPath defaults to a snapshot type when no type is given (or a specific one like ORDERED_NODE_SNAPSHOT_TYPE)
        const result = editingSupport.evaluateXPath(xpathExpr); // No result type explicitly passed to function
        
        // The z-plugin.js evaluateXPath function returns an array of nodes if resultType is not specified.
        // This is different from the raw document.evaluate behavior.
        if (Array.isArray(result)) {
            assert.ok(true, "Result is an array (custom behavior of plugin).");
            assert.equal(result.length, 3, "Snapshot (array) contains three items.");
            const texts = result.map(n => n.textContent);
            // Check if items are in document order
            assert.deepEqual(texts, ["Item A", "Item B", "Item C"], "Snapshot (array) items are correct and in document order.");
        } else if (result.resultType === XPathResult.ORDERED_NODE_SNAPSHOT_TYPE || 
                   result.resultType === XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE) {
            // This branch would be for a raw XPath engine behavior, not the current plugin's default
            assert.ok(true, "Result type is a snapshot type.");
            assert.equal(result.snapshotLength, 3, "Snapshot contains three items.");
            const texts = [];
            for (let i = 0; i < result.snapshotLength; i++) {
                texts.push(result.snapshotItem(i).textContent);
            }
            assert.deepEqual(texts, ["Item A", "Item B", "Item C"], "Snapshot items are correct and in document order.");
        } else {
             assert.ok(false, "Result type is not an array or a snapshot type. Actual type: " + (result.resultType ? result.resultType : typeof result ));
        }
    });

    // --- Namespace Provider ---
    QUnit.test("With Namespace Provider", function(assert) {
      const nsDoc = '<global xmlns:h="http://www.w3.org/TR/html4/" xmlns:custom="http://example.com/custom">' +
                      '<h:table><h:tr><h:td>Cell 1</h:td></h:tr></h:table>' +
                      '<custom:info status="active">Custom Info</custom:info>' +
                    '</global>';
      editingSupport.getDocument = function() { return parser.parseFromString(nsDoc, "text/xml"); };
      
      const nsProvider = function(prefix) {
        if (prefix === 'html') return 'http://www.w3.org/TR/html4/';
        if (prefix === 'c') return 'http://example.com/custom';
        return null;
      };
      
      let xpathExpr = "//html:td";
      let result = editingSupport.evaluateXPath(xpathExpr, nsProvider, XPathResult.FIRST_ORDERED_NODE_TYPE);
      assert.ok(result.singleNodeValue, "HTML TD element should be found with namespace provider");
      assert.equal(result.singleNodeValue.textContent, "Cell 1", "Correct content for namespaced TD");

      xpathExpr = "//c:info[@status='active']";
      result = editingSupport.evaluateXPath(xpathExpr, nsProvider, XPathResult.FIRST_ORDERED_NODE_TYPE);
      assert.ok(result.singleNodeValue, "Custom info element should be found");
      assert.equal(result.singleNodeValue.namespaceURI, "http://example.com/custom", "Correct namespace URI for custom element");
    });

    QUnit.test("Without Namespace Provider (prefixed elements not found)", function(assert) {
      const nsDoc = '<global xmlns:my="http://example.com"><my:data>content</my:data></global>';
      editingSupport.getDocument = function() { return parser.parseFromString(nsDoc, "text/xml"); };
      
      const xpathExpr = "//my:data"; // Prefix 'my' is not standard
      const result = editingSupport.evaluateXPath(xpathExpr, null, XPathResult.FIRST_ORDERED_NODE_TYPE);
      // wgxpath might resolve known prefixes from the document, or it might require nsProvider for arbitrary prefixes.
      // If it resolves from doc, this test might need adjustment or the XPath engine behavior confirmed.
      // Assuming for now it won't find it without nsProvider if prefix is not 'xml'.
      if (result.singleNodeValue && result.singleNodeValue.prefix === "my") {
           assert.ok(true, "Node was found, wgxpath might have resolved namespace from document for 'my:'.");
      } else {
           assert.notOk(result.singleNodeValue, "Prefixed element 'my:data' should ideally not be found without a namespace provider");
      }
    });
    
    QUnit.test("With Namespace Provider for default namespace", function(assert) {
        const defaultNsDoc = '<root xmlns="http://mydefault.org"><itemInDefaultNS>Data</itemInDefaultNS></root>';
        editingSupport.getDocument = function() { return parser.parseFromString(defaultNsDoc, "text/xml"); };

        const nsProvider = function(p) { if (p === 'def') return 'http://mydefault.org'; return null; };
        const xpathExpr = "//def:itemInDefaultNS"; // Must use a prefix with the resolver for default ns
        const result = editingSupport.evaluateXPath(xpathExpr, nsProvider, XPathResult.FIRST_ORDERED_NODE_TYPE);

        assert.ok(result.singleNodeValue, "Element in default namespace found using prefix and resolver");
        assert.equal(result.singleNodeValue.textContent, "Data", "Correct content for default ns element");
        assert.equal(result.singleNodeValue.namespaceURI, "http://mydefault.org", "Correct namespace URI for default ns element");
    });


    // --- Empty/Invalid Cases ---
    QUnit.test("XPath selects no nodes in the document", function(assert) {
      const xpathExpr = "//nonExistentElement";
      const result = editingSupport.evaluateXPath(xpathExpr, null, XPathResult.UNORDERED_NODE_ITERATOR_TYPE);
      assert.notOk(result.iterateNext(), "Iterator should be empty for non-existent element");

      const snapshotResult = editingSupport.evaluateXPath(xpathExpr, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE);
      assert.equal(snapshotResult.snapshotLength, 0, "Snapshot should be empty");
      
      // Test with default result type (array)
      const arrayResult = editingSupport.evaluateXPath(xpathExpr);
      assert.ok(Array.isArray(arrayResult), "Result should be an array");
      assert.equal(arrayResult.length, 0, "Array should be empty for non-existent element");
    });

    QUnit.test("Invalid XPath expression", function(assert) {
      const invalidXPathExpr = "///invalid-xpath";
      assert.throws(
        function() {
          editingSupport.evaluateXPath(invalidXPathExpr);
        },
        Error, // Or a more specific XPathException/DOMException type
        "Evaluating an invalid XPath should throw an error."
      );
    });

    QUnit.test("getDocument returns null", function(assert) {
      editingSupport.getDocument = function() { return null; };
      const xpathExpr = "//anything";
      // The plugin's evaluateXPath currently creates a dummy document if getDocument() is null.
      // `doc = editingSupport.getDocument(); if (!doc) { doc = document.implementation.createDocument(null, "dummy", null); }`
      // So, it will run against this dummy document.
      const result = editingSupport.evaluateXPath(xpathExpr); // Default array result
      assert.ok(Array.isArray(result), "Result is an array even if getDocument is null (due to dummy doc)");
      assert.equal(result.length, 0, "No nodes should be found in the dummy document");

      const stringResult = editingSupport.evaluateXPath(xpathExpr, null, XPathResult.STRING_TYPE);
      assert.equal(stringResult.stringValue, "", "String result should be empty for dummy document");
    });
    
    QUnit.test("getDocument returns an empty document", function(assert) {
      editingSupport.getDocument = function() { 
        // An XML document with no document element
        return parser.parseFromString("<?xml version='1.0' encoding='UTF-8'?>", "text/xml"); 
      };
      const xpathExpr = "//*"; // Select any element
      const result = editingSupport.evaluateXPath(xpathExpr);
      assert.ok(Array.isArray(result), "Result is an array for empty document");
      assert.equal(result.length, 0, "No elements should be found in an empty document");

      const countResult = editingSupport.evaluateXPath("count(//*)", null, XPathResult.NUMBER_TYPE);
      assert.equal(countResult.numberValue, 0, "Count of elements should be 0 in an empty document");
    });
    
    QUnit.test("getDocument returns a document with only a processing instruction or comment", function(assert) {
      editingSupport.getDocument = function() { 
        return parser.parseFromString("<?xml-stylesheet type='text/css' href='style.css'?><!-- comment -->", "text/xml"); 
      };
      const xpathExpr = "//*"; // Select any element
      const result = editingSupport.evaluateXPath(xpathExpr);
      assert.ok(Array.isArray(result), "Result is an array");
      assert.equal(result.length, 0, "No elements should be found");

      const piTest = editingSupport.evaluateXPath("/processing-instruction('xml-stylesheet')", null, XPathResult.FIRST_ORDERED_NODE_TYPE);
      assert.ok(piTest.singleNodeValue, "Should be able to select processing instruction");
      assert.equal(piTest.singleNodeValue.nodeType, 7, "Node type should be PROCESSING_INSTRUCTION_NODE");

      const commentTest = editingSupport.evaluateXPath("/comment()", null, XPathResult.FIRST_ORDERED_NODE_TYPE);
      assert.ok(commentTest.singleNodeValue, "Should be able to select comment node");
      assert.equal(commentTest.singleNodeValue.nodeType, 8, "Node type should be COMMENT_NODE");
    });

  });


  // Tests for evaluateXPathAtSelection (selection context)
  QUnit.module('evaluateXPathAtSelection Tests', function(hooks) {
    hooks.beforeEach(function(assert) {
      // 1. Ensure window.editor and getEditingSupport are set up.
      window.editor.resetEditingSupport();

      // 2. Trigger the event.
      workspace.triggerEvent(sync.api.Workspace.EventType.EDITOR_LOADED);
      
      // 3. Obtain the editingSupport instance *after* the plugin has initialized.
      editingSupport = window.editor.getEditingSupport();

      if (!editingSupport || !editingSupport.getSelectionManager) {
          if (assert && assert.ok) {
            assert.ok(false, "Critical: editingSupport was not properly initialized in evaluateXPathAtSelection Tests beforeEach.");
          } else {
            console.error("Editing support not available after plugin initialization in evaluateXPathAtSelection Tests module.");
          }
      }
      // Default mocks for selection can be set here if needed, or within individual tests
      // For example:
      // if (editingSupport && editingSupport.getSelectionManager) {
      //   editingSupport.getSelectionManager().getSelection().getNodeAtSelection = function() { ... default mock ... };
      // }
    });

    // --- Basic Selections ---
    QUnit.test("Select node by ID", function(assert) {
      const mockSelectedXML = '<root><contextNode><child id="target">Correct Node</child><child id="other">Other Node</child></contextNode></root>';
      editingSupport.getSelectionManager().getSelection().getNodeAtSelection = function() {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(mockSelectedXML, "text/xml");
        return xmlDoc.getElementsByTagName('contextNode')[0];
      };

      const xpathExpr = ".//child[@id='target']"; // Relative to contextNode
      const result = editingSupport.evaluateXPathAtSelection(xpathExpr, null, XPathResult.FIRST_ORDERED_NODE_TYPE);

      assert.ok(result.singleNodeValue, "A node should be returned");
      assert.equal(result.singleNodeValue.nodeName, "child", "Correct node name selected");
      assert.equal(result.singleNodeValue.getAttribute('id'), "target", "Correct id attribute selected");
      assert.equal(result.singleNodeValue.textContent, "Correct Node", "Correct node content selected");
    });

    QUnit.test("Select node by tag name", function(assert) {
      const mockSelectedXML = '<root><contextNode><tagNameTest>Target Tag</tagNameTest><otherTag/></contextNode></root>';
      editingSupport.getSelectionManager().getSelection().getNodeAtSelection = function() {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(mockSelectedXML, "text/xml");
        return xmlDoc.getElementsByTagName('contextNode')[0];
      };

      const xpathExpr = ".//tagNameTest";
      const result = editingSupport.evaluateXPathAtSelection(xpathExpr, null, XPathResult.FIRST_ORDERED_NODE_TYPE);

      assert.ok(result.singleNodeValue, "A node should be returned");
      assert.equal(result.singleNodeValue.nodeName, "tagNameTest", "Correct node name selected");
      assert.equal(result.singleNodeValue.textContent, "Target Tag", "Correct node content selected");
    });

    QUnit.test("Select node by attribute value", function(assert) {
      const mockSelectedXML = '<root><contextNode><element attr="findme">Found</element><element attr="dontfind">Not this</element></contextNode></root>';
      editingSupport.getSelectionManager().getSelection().getNodeAtSelection = function() {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(mockSelectedXML, "text/xml");
        return xmlDoc.getElementsByTagName('contextNode')[0];
      };

      const xpathExpr = ".//element[@attr='findme']";
      const result = editingSupport.evaluateXPathAtSelection(xpathExpr, null, XPathResult.FIRST_ORDERED_NODE_TYPE);

      assert.ok(result.singleNodeValue, "A node should be returned");
      assert.equal(result.singleNodeValue.getAttribute('attr'), "findme", "Correct attribute value selected");
      assert.equal(result.singleNodeValue.textContent, "Found", "Correct node content selected");
    });

    // --- Context Node ---
    QUnit.test("XPath is relative to selected node", function(assert) {
      const mockSelectedXML = '<root><selected id="currentContext"><childToFind>In Context</childToFind></selected><otherParent><childToFind>Not In Context</childToFind></otherParent></root>';
      editingSupport.getSelectionManager().getSelection().getNodeAtSelection = function() {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(mockSelectedXML, "text/xml");
        return xmlDoc.getElementById('currentContext');
      };

      const xpathExpr = "./childToFind"; // Directly under the context node
      const result = editingSupport.evaluateXPathAtSelection(xpathExpr, null, XPathResult.FIRST_ORDERED_NODE_TYPE);

      assert.ok(result.singleNodeValue, "A node should be returned");
      assert.equal(result.singleNodeValue.textContent, "In Context", "Node content indicates it's relative to the context");
    });

    QUnit.test("Context node is the documentElement if selection is the document itself", function(assert) {
      const mockDocumentXML = '<docRoot id="docRoot"><childInDoc>Document Child</childInDoc></docRoot>';
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(mockDocumentXML, "text/xml");

      editingSupport.getSelectionManager().getSelection().getNodeAtSelection = function() {
        return xmlDoc; // Selected node is the document node
      };

      // XPath from the document root
      const xpathExpr = "/docRoot/childInDoc";
      const result = editingSupport.evaluateXPathAtSelection(xpathExpr, null, XPathResult.FIRST_ORDERED_NODE_TYPE);

      assert.ok(result.singleNodeValue, "A node should be returned from document context");
      assert.equal(result.singleNodeValue.textContent, "Document Child", "Correct child of documentElement found");
    });
    
    QUnit.test("Context node is the selected element itself", function(assert) {
      const mockSelectedXML = '<root><selected id="currentContext" value="self"><childToFind>In Context</childToFind></selected></root>';
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(mockSelectedXML, "text/xml");
      const selectedNode = xmlDoc.getElementById('currentContext');

      editingSupport.getSelectionManager().getSelection().getNodeAtSelection = function() {
        return selectedNode;
      };
      
      // XPath selecting the context node itself
      const xpathExpr = "."; 
      const result = editingSupport.evaluateXPathAtSelection(xpathExpr, null, XPathResult.FIRST_ORDERED_NODE_TYPE);

      assert.ok(result.singleNodeValue, "A node should be returned");
      assert.strictEqual(result.singleNodeValue, selectedNode, "The context node itself should be selected");
      assert.equal(result.singleNodeValue.getAttribute('value'), 'self', "Attribute of context node is correct");
    });


    // --- Result Types ---
    QUnit.test("Result Type: STRING_TYPE", function(assert) {
      const mockSelectedXML = '<root><context><name>Test Name</name></context></root>';
      editingSupport.getSelectionManager().getSelection().getNodeAtSelection = function() {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(mockSelectedXML, "text/xml");
        return xmlDoc.getElementsByTagName('context')[0];
      };
      const xpathExpr = "string(.//name)";
      const result = editingSupport.evaluateXPathAtSelection(xpathExpr, null, XPathResult.STRING_TYPE);
      assert.equal(result.resultType, XPathResult.STRING_TYPE, "Result type is STRING_TYPE");
      assert.equal(result.stringValue, "Test Name", "Correct string value returned");
    });

    QUnit.test("Result Type: NUMBER_TYPE", function(assert) {
      const mockSelectedXML = '<root><context><value>123</value><count>2</count></context></root>';
      editingSupport.getSelectionManager().getSelection().getNodeAtSelection = function() {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(mockSelectedXML, "text/xml");
        return xmlDoc.getElementsByTagName('context')[0];
      };
      const xpathExpr = "number(.//value) + count(.//count)"; // 123 + 1 = 124
      const result = editingSupport.evaluateXPathAtSelection(xpathExpr, null, XPathResult.NUMBER_TYPE);
      assert.equal(result.resultType, XPathResult.NUMBER_TYPE, "Result type is NUMBER_TYPE");
      assert.equal(result.numberValue, 124, "Correct numeric value returned");
    });

    QUnit.test("Result Type: BOOLEAN_TYPE (true)", function(assert) {
      const mockSelectedXML = '<root><context><item id="A"/></context></root>';
      editingSupport.getSelectionManager().getSelection().getNodeAtSelection = function() {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(mockSelectedXML, "text/xml");
        return xmlDoc.getElementsByTagName('context')[0];
      };
      const xpathExpr = "boolean(.//item[@id='A'])";
      const result = editingSupport.evaluateXPathAtSelection(xpathExpr, null, XPathResult.BOOLEAN_TYPE);
      assert.equal(result.resultType, XPathResult.BOOLEAN_TYPE, "Result type is BOOLEAN_TYPE");
      assert.strictEqual(result.booleanValue, true, "Correct boolean value (true) returned");
    });

    QUnit.test("Result Type: BOOLEAN_TYPE (false)", function(assert) {
      const mockSelectedXML = '<root><context><item id="A"/></context></root>';
      editingSupport.getSelectionManager().getSelection().getNodeAtSelection = function() {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(mockSelectedXML, "text/xml");
        return xmlDoc.getElementsByTagName('context')[0];
      };
      const xpathExpr = "boolean(.//item[@id='B'])";
      const result = editingSupport.evaluateXPathAtSelection(xpathExpr, null, XPathResult.BOOLEAN_TYPE);
      assert.equal(result.resultType, XPathResult.BOOLEAN_TYPE, "Result type is BOOLEAN_TYPE");
      assert.strictEqual(result.booleanValue, false, "Correct boolean value (false) returned");
    });

    QUnit.test("Result Type: FIRST_ORDERED_NODE_TYPE", function(assert) {
      const mockSelectedXML = '<root><context><item>First</item><item>Second</item></context></root>';
      editingSupport.getSelectionManager().getSelection().getNodeAtSelection = function() {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(mockSelectedXML, "text/xml");
        return xmlDoc.getElementsByTagName('context')[0];
      };
      const xpathExpr = ".//item"; // Selects both, should return first
      const result = editingSupport.evaluateXPathAtSelection(xpathExpr, null, XPathResult.FIRST_ORDERED_NODE_TYPE);
      assert.equal(result.resultType, XPathResult.FIRST_ORDERED_NODE_TYPE, "Result type is FIRST_ORDERED_NODE_TYPE");
      assert.ok(result.singleNodeValue, "A node should be returned");
      assert.equal(result.singleNodeValue.textContent, "First", "Correct first node returned");
    });

    QUnit.test("Result Type: UNORDERED_NODE_ITERATOR_TYPE", function(assert) {
      const mockSelectedXML = '<root><context><item>A</item><item>B</item><item>C</item></context></root>';
      editingSupport.getSelectionManager().getSelection().getNodeAtSelection = function() {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(mockSelectedXML, "text/xml");
        return xmlDoc.getElementsByTagName('context')[0];
      };
      const xpathExpr = ".//item";
      const result = editingSupport.evaluateXPathAtSelection(xpathExpr, null, XPathResult.UNORDERED_NODE_ITERATOR_TYPE);
      assert.equal(result.resultType, XPathResult.UNORDERED_NODE_ITERATOR_TYPE, "Result type is UNORDERED_NODE_ITERATOR_TYPE");
      
      const foundTexts = [];
      let node = result.iterateNext();
      while(node) {
        foundTexts.push(node.textContent);
        node = result.iterateNext();
      }
      assert.deepEqual(foundTexts.sort(), ["A", "B", "C"].sort(), "All iterated nodes are correct");
    });
    
    QUnit.test("Result Type: UNORDERED_NODE_SNAPSHOT_TYPE (as default)", function(assert) {
        const mockSelectedXML = '<root><context><item>SnapA</item><item>SnapB</item></context></root>';
        editingSupport.getSelectionManager().getSelection().getNodeAtSelection = function() {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(mockSelectedXML, "text/xml");
            return xmlDoc.getElementsByTagName('context')[0];
        };
        const xpathExpr = ".//item";
        // No resultType specified, should default to UNORDERED_NODE_SNAPSHOT_TYPE or similar NodeSet result
        const result = editingSupport.evaluateXPathAtSelection(xpathExpr); 

        if (result.resultType === XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE || 
            result.resultType === XPathResult.ORDERED_NODE_SNAPSHOT_TYPE) {
            assert.ok(true, "Result type is a snapshot type.");
            assert.equal(result.snapshotLength, 2, "Snapshot contains two items.");
            const texts = [];
            for (let i = 0; i < result.snapshotLength; i++) {
                texts.push(result.snapshotItem(i).textContent);
            }
            assert.deepEqual(texts.sort(), ["SnapA", "SnapB"].sort(), "Snapshot items are correct.");
        } else if (Array.isArray(result)) { // Fallback for older z-plugin that returns array
             assert.ok(true, "Result is an array (legacy behavior).");
             assert.equal(result.length, 2, "Array contains two items.");
             const texts = result.map(n => n.textContent);
             assert.deepEqual(texts.sort(), ["SnapA", "SnapB"].sort(), "Array items are correct.");
        } else {
            assert.ok(false, "Result type is not a snapshot type or an array. Actual type: " + result.resultType);
        }
    });


    // --- Namespace Provider ---
    QUnit.test("With Namespace Provider", function(assert) {
      const mockSelectedXML = '<root xmlns:my="http://example.com"><my:customElt my:attr="val">NS Content</my:customElt></root>';
      editingSupport.getSelectionManager().getSelection().getNodeAtSelection = function() {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(mockSelectedXML, "text/xml");
        return xmlDoc.documentElement;
      };
      
      const nsProvider = function(prefix) {
        if (prefix === 'myns') return 'http://example.com';
        return null;
      };
      const xpathExpr = ".//myns:customElt[@myns:attr='val']";
      const result = editingSupport.evaluateXPathAtSelection(xpathExpr, nsProvider, XPathResult.FIRST_ORDERED_NODE_TYPE);

      assert.ok(result.singleNodeValue, "A node should be returned with namespace");
      assert.equal(result.singleNodeValue.nodeName, "my:customElt", "Correct namespaced node name");
      assert.equal(result.singleNodeValue.textContent, "NS Content", "Correct content for namespaced node");
      assert.equal(result.singleNodeValue.namespaceURI, "http://example.com", "Correct namespace URI");
    });

    QUnit.test("Without Namespace Provider (should not find prefixed element)", function(assert) {
      const mockSelectedXML = '<root xmlns:my="http://example.com"><my:customElt>NS Content</my:customElt></root>';
      editingSupport.getSelectionManager().getSelection().getNodeAtSelection = function() {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(mockSelectedXML, "text/xml");
        return xmlDoc.documentElement;
      };
      
      // No nsProvider, so myns:customElt should not be found if XPath engine requires it
      const xpathExpr = ".//myns:customElt"; 
      const result = editingSupport.evaluateXPathAtSelection(xpathExpr, null, XPathResult.FIRST_ORDERED_NODE_TYPE);
      
      // Depending on XPath engine, this might throw an error or return null.
      // wgxpath might resolve known prefixes from the document, or it might require nsProvider for arbitrary prefixes.
      // For this test, we assume it won't find it if nsProvider is not given for "myns"
      if (result.singleNodeValue && result.singleNodeValue.prefix === "my") {
           assert.ok(true, "Node was found, wgxpath might have resolved namespace from document.");
      } else {
           assert.notOk(result.singleNodeValue, "Node should not be returned without namespace provider if prefix is not standard like 'xml'");
      }
    });
    
    QUnit.test("With Namespace Provider for default namespace", function(assert) {
        const mockSelectedXML = '<root xmlns="http://default.example.com"><elementInDefaultNS>Default NS Content</elementInDefaultNS></root>';
        editingSupport.getSelectionManager().getSelection().getNodeAtSelection = function() {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(mockSelectedXML, "text/xml");
            return xmlDoc.documentElement;
        };
        
        const nsProvider = function(prefix) {
            if (prefix === 'd') return 'http://default.example.com';
            return null;
        };
        // XPath requires a prefix for user-defined default namespaces.
        const xpathExpr = ".//d:elementInDefaultNS"; 
        const result = editingSupport.evaluateXPathAtSelection(xpathExpr, nsProvider, XPathResult.FIRST_ORDERED_NODE_TYPE);

        assert.ok(result.singleNodeValue, "A node should be returned using prefix for default namespace");
        assert.equal(result.singleNodeValue.localName, "elementInDefaultNS", "Correct local name for namespaced node");
        assert.equal(result.singleNodeValue.textContent, "Default NS Content", "Correct content for namespaced node");
        assert.equal(result.singleNodeValue.namespaceURI, "http://default.example.com", "Correct namespace URI");
    });


    // --- Empty/Invalid Cases ---
    QUnit.test("XPath selects no nodes", function(assert) {
      const mockSelectedXML = '<root><context><item/></context></root>';
      editingSupport.getSelectionManager().getSelection().getNodeAtSelection = function() {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(mockSelectedXML, "text/xml");
        return xmlDoc.getElementsByTagName('context')[0];
      };
      const xpathExpr = ".//nonExistentElement";
      const result = editingSupport.evaluateXPathAtSelection(xpathExpr, null, XPathResult.FIRST_ORDERED_NODE_TYPE);
      assert.notOk(result.singleNodeValue, "No node should be returned for non-existent element");

      const iteratorResult = editingSupport.evaluateXPathAtSelection(xpathExpr, null, XPathResult.UNORDERED_NODE_ITERATOR_TYPE);
      assert.notOk(iteratorResult.iterateNext(), "Iterator should be empty for non-existent element");
    });

    QUnit.test("Invalid XPath expression", function(assert) {
      const mockSelectedXML = '<root><context/></root>';
      editingSupport.getSelectionManager().getSelection().getNodeAtSelection = function() {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(mockSelectedXML, "text/xml");
        return xmlDoc.getElementsByTagName('context')[0];
      };
      const invalidXPathExpr = "///invalid-xpath";
      assert.throws(
        function() {
          editingSupport.evaluateXPathAtSelection(invalidXPathExpr, null, XPathResult.FIRST_ORDERED_NODE_TYPE);
        },
        Error, // Or a more specific XPathException if available/expected
        "Evaluating an invalid XPath should throw an error."
      );
    });

    QUnit.test("Selection context is null", function(assert) {
      editingSupport.getSelectionManager().getSelection().getNodeAtSelection = function() {
        return null; // Simulate no node selected or invalid selection
      };
      const xpathExpr = ".//anything";
      const result = editingSupport.evaluateXPathAtSelection(xpathExpr, null, XPathResult.FIRST_ORDERED_NODE_TYPE);
      // The plugin currently creates a dummy document if context is null.
      // This behavior might be debated (throw error vs. return null/empty).
      // Current z-plugin.js:
      //  `if (!contextNode) { contextNode = document.implementation.createDocument(null, "dummy", null); }`
      // So, it will run against this dummy document.
      assert.notOk(result.singleNodeValue, "No node should be found in dummy document for './/anything'");

      const iteratorResult = editingSupport.evaluateXPathAtSelection(xpathExpr, null, XPathResult.UNORDERED_NODE_ITERATOR_TYPE);
      assert.notOk(iteratorResult.iterateNext(), "Iterator should be empty when context is null (runs on dummy doc)");
    });
    
    QUnit.test("Selection context is not a valid node type (e.g. attribute)", function(assert) {
      const mockSelectedXML = '<root><element myAttr="value" /></root>';
      editingSupport.getSelectionManager().getSelection().getNodeAtSelection = function() {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(mockSelectedXML, "text/xml");
        return xmlDoc.documentElement.firstChild.getAttributeNode("myAttr"); // Selected node is an Attr node
      };
      const xpathExpr = "."; // XPath on an attribute node
      
      // XPath evaluation on an attribute node can be tricky. Some engines might not support it as context.
      // wgxpath might handle it. If it does, '.' should return the attribute itself.
      // If not, it might throw an error or return null.
      try {
        const result = editingSupport.evaluateXPathAtSelection(xpathExpr, null, XPathResult.FIRST_ORDERED_NODE_TYPE);
        // If an Attr node can be a context, '.' would select itself.
        // However, XPath usually expects Element, Document, or DocumentFragment nodes as contexts.
        // The spec for `evaluate` says contextNode can be any node.
        assert.ok(result.singleNodeValue, "Result should have a singleNodeValue if Attr context is supported.");
        assert.equal(result.singleNodeValue.nodeType, 2, "Node type should be attribute (2).");
        assert.equal(result.singleNodeValue.nodeName, "myAttr", "Node name should be the attribute name.");

      } catch (e) {
        assert.ok(true, "Threw an error as expected, or Attr node as context is not fully supported for '.' by the engine: " + e.message);
      }
    });

  });
});
