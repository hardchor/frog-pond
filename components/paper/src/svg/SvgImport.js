/*
 * Paper.js - The Swiss Army Knife of Vector Graphics Scripting.
 * http://paperjs.org/
 *
 * Copyright (c) 2011 - 2013, Juerg Lehni & Jonathan Puckey
 * http://lehni.org/ & http://jonathanpuckey.com/
 *
 * Distributed under the MIT license. See LICENSE file for details.
 *
 * All rights reserved.
 */

/**
 * A function scope holding all the functionality needed to convert a SVG DOM
 * to a Paper.js DOM.
 */
new function() {
	// Define a couple of helper functions to easily read values from SVG
	// objects, dealing with baseVal, and item lists.
	// index is option, and if passed, causes a lookup in a list.

	function getValue(node, key, allowNull, index) {
		// node[key].baseVal will even be set if the node did not define the
		// attribute, so if allowNull is true, we need to also check
		// node.getAttribute(key) == null
		var base = (!allowNull || node.getAttribute(key) != null)
				&& node[key] && node[key].baseVal;
		// Note: String values are unfortunately not stored in base.value, but
		// in base directly, so we need to check both, also on item lists, using
		// Base.pick(base.value, base)
		return base
				? index !== undefined
					// Item list? Look up by index:
					? index < base.numberOfItems
						? Base.pick((base = base.getItem(index)).value, base)
						: null
					: Base.pick(base.value, base)
				: null;
	}

	function getPoint(node, x, y, allowNull, index) {
		x = getValue(node, x, allowNull, index);
		y = getValue(node, y, allowNull, index);
		return allowNull && x == null && y == null ? null
				: Point.create(x || 0, y || 0);
	}

	function getSize(node, w, h, allowNull, index) {
		w = getValue(node, w, allowNull, index);
		h = getValue(node, h, allowNull, index);
		return allowNull && w == null && h == null ? null
				: Size.create(w || 0, h || 0);
	}

	// Converts a string attribute value to the specified type
	function convertValue(value, type) {
		return value === 'none'
				? null
				: type === 'number'
					? parseFloat(value)
					: type === 'array'
						? value ? value.split(/[\s,]+/g).map(parseFloat) : []
						: type === 'color' && getDefinition(value)
							|| value;
	}

	// Importer functions for various SVG node types

	function importGroup(node, type) {
		var nodes = node.childNodes,
			clip = type === 'clipPath',
			item = clip ? new CompoundPath() : new Group(),
			project = item._project,
			currentStyle = project._currentStyle;
		// Style on items needs to be handled differently than all other items:
		// We first apply the style to the item, then use it as the project's
		// currentStyle, so it is used as a default for the creation of all
		// nested items. importSvg then needs to check for items and avoid
		// calling applyAttributes() again.
		// Set the default color to black, since that's how SVG handles fills.
		item.setFillColor('black');
		if (!clip) {
			item = applyAttributes(item, node);
			project._currentStyle = item._style.clone();
		}
		for (var i = 0, l = nodes.length; i < l; i++) {
			var childNode = nodes[i],
				child;
			if (childNode.nodeType == 1 && (child = importSvg(childNode))) {
				// If adding CompoundPaths to other CompoundPaths,
				// we need to "unbox" them first:
				if (clip && child instanceof CompoundPath) {
					item.addChildren(child.removeChildren());
					child.remove();
				} else if (!(child instanceof Symbol)) {
					item.addChild(child);
				}
			}
		}
		// clip paths are reduced (unboxed) and their attributes applied at the
		// end.
		if (clip)
			item = applyAttributes(item.reduce(), node);
		// Restore currentStyle
		project._currentStyle = currentStyle;
		if (clip || type === 'defs') {
			// We don't want the defs in the DOM. But we might want to use
			// Symbols for them to save memory?
			item.remove();
			item = null;
		}
		return item;
	}

	function importPoly(node, type) {
		var path = new Path(),
			points = node.points;
		path.moveTo(points.getItem(0));
		for (var i = 1, l = points.numberOfItems; i < l; i++)
			path.lineTo(points.getItem(i));
		if (type === 'polygon')
			path.closePath();
		return path;
	}

	function importPath(node) {
		// Get the path data, and determine wether it is a compound path or a
		// normal path based on the amount of moveTo commands inside it.
		var data = node.getAttribute('d'),
			path = data.match(/m/gi).length > 1
					? new CompoundPath()
					: new Path();
		path.setPathData(data);
		return path;
	}

	function importGradient(node, type) {
		var nodes = node.childNodes,
			stops = [];
		for (var i = 0, l = nodes.length; i < l; i++) {
			var child = nodes[i];
			if (child.nodeType == 1)
				stops.push(applyAttributes(new GradientStop(), child));
		}
		var isRadial = type === 'radialGradient',
			gradient = new Gradient(stops, isRadial),
			origin, destination, highlight;
		if (isRadial) {
			origin = getPoint(node, 'cx', 'cy');
			destination = origin.add(getValue(node, 'r'), 0);
			highlight = getPoint(node, 'fx', 'fy', true);
		} else {
			origin = getPoint(node, 'x1', 'y1');
			destination = getPoint(node, 'x2', 'y2');
		}
		applyAttributes(
			new Color(gradient, origin, destination, highlight), node);
		// We don't return the gradient, since we only need a reference to it in
		// definitions, which is created in applyAttributes()
		return null;
	}

	var importers = {
		// http://www.w3.org/TR/SVG/struct.html#Groups
		g: importGroup,
		// http://www.w3.org/TR/SVG/struct.html#NewDocument
		svg: importGroup,
		clipPath: importGroup,
		// http://www.w3.org/TR/SVG/shapes.html#PolygonElement
		polygon: importPoly,
		// http://www.w3.org/TR/SVG/shapes.html#PolylineElement
		polyline: importPoly,
		// http://www.w3.org/TR/SVG/paths.html
		path: importPath,
		// http://www.w3.org/TR/SVG/pservers.html#LinearGradients
		linearGradient: importGradient,
		// http://www.w3.org/TR/SVG/pservers.html#RadialGradients
		radialGradient: importGradient,

		// http://www.w3.org/TR/SVG/struct.html#ImageElement
		image: function (node) {
			var raster = new Raster(getValue(node, 'href'));
			raster.attach('load', function() {
				var size = getSize(node, 'width', 'height');
				this.setSize(size);
				// Since x and y start from the top left of an image, add
				// half of its size:
				this.translate(getPoint(node, 'x', 'y').add(size.divide(2)));
			});
			return raster;
		},

		// http://www.w3.org/TR/SVG/struct.html#SymbolElement
		symbol: function(node, type) {
			// Pass true for dontCenter:
			return new Symbol(importGroup(node, type), true);
		},

		// http://www.w3.org/TR/SVG/struct.html#DefsElement
		defs: importGroup,

		// http://www.w3.org/TR/SVG/struct.html#UseElement
		use: function(node, type) {
			// Note the namespaced xlink:href attribute is just called href
			// as a property on node.
			// TODO: Support overflow and width, height, in combination with
			// overflow: hidden. Paper.js currently does not suport PlacedSymbol
			// clipping, but perhaps it should?
			var id = (getValue(node, 'href') || '').substring(1),
				definition = definitions[id],
				point = getPoint(node, 'x', 'y');
			// Use place if we're dealing with a symbol:
			return definition
					? definition instanceof Symbol
						// When placing symbols, we nee to take both point and
						// matrix into account. This just does the right thing:
						? definition.place(point)
						: definition.clone().translate(point)
					: null;
		},

		// http://www.w3.org/TR/SVG/shapes.html#InterfaceSVGCircleElement
		circle: function(node) {
			return new Path.Circle(getPoint(node, 'cx', 'cy'),
					getValue(node, 'r'));
		},

		// http://www.w3.org/TR/SVG/shapes.html#InterfaceSVGEllipseElement
		ellipse: function(node) {
			var center = getPoint(node, 'cx', 'cy'),
				radius = getSize(node, 'rx', 'ry');
			return new Path.Ellipse(new Rectangle(center.subtract(radius),
					center.add(radius)));
		},

		// http://www.w3.org/TR/SVG/shapes.html#RectElement
		rect: function(node) {
			var point = getPoint(node, 'x', 'y'),
				size = getSize(node, 'width', 'height'),
				radius = getSize(node, 'rx', 'ry');
			// If radius is 0, Path.RoundRectangle automatically produces a
			// normal rectangle for us.
			return new Path.RoundRectangle(new Rectangle(point, size), radius);
		},

		// http://www.w3.org/TR/SVG/shapes.html#LineElement
		line: function(node) {
			return new Path.Line(getPoint(node, 'x1', 'y1'),
					getPoint(node, 'x2', 'y2'));
		},

		text: function(node) {
			// Not supported by Paper.js
			// x: multiple values for x
			// y: multiple values for y
			// dx: multiple values for x
			// dy: multiple values for y
			// TODO: Support for these is missing in Paper.js right now
			// rotate: character rotation
			// lengthAdjust:
			var text = new PointText(getPoint(node, 'x', 'y', false, 0)
					.add(getPoint(node, 'dx', 'dy', false, 0)));
			text.setContent(node.textContent.trim() || '');
			return text;
		}
	};

	// Attributes and Styles

	// NOTE: Parmeter sequence for all apply*() functions is: 
	// (item, value, name, node) rather than (item, node, name, value),
	// so we can ommit the less likely parameters from right to left.

	function applyTransform(item, value, name, node) {
		// http://www.w3.org/TR/SVG/types.html#DataTypeTransformList
		var transforms = node[name].baseVal,
			matrix = new Matrix();
		for (var i = 0, l = transforms.numberOfItems; i < l; i++) {
			var mx = transforms.getItem(i).matrix;
			matrix.concatenate(
				new Matrix(mx.a, mx.b, mx.c, mx.d, mx.e, mx.f));
		}
		item.transform(matrix);
	}

	function applyOpacity(item, value, name) {
		// http://www.w3.org/TR/SVG/painting.html#FillOpacityProperty
		// http://www.w3.org/TR/SVG/painting.html#StrokeOpacityProperty
		var color = item._style[name === 'fill-opacity' ? 'getFillColor'
				: 'getStrokeColor']();
		if (color)
			color.setAlpha(parseFloat(value));
	}

	// Create apply-functions for attributes, and merge in those for SvgStlyes:
	var attributes = Base.each(SvgStyles, function(entry) {
		this[entry.attribute] = function(item, value, name, node) {
			item._style[entry.set](convertValue(value, entry.type));
		};
	}, {
		id: function(item, value) {
			definitions[value] = item;
			if (item.setName)
				item.setName(value);
		},

		'clip-path': function(item, value) {
			// http://www.w3.org/TR/SVG/masking.html#ClipPathProperty
			var clip = getDefinition(value);
			if (clip) {
				clip = clip.clone();
				clip.setClipMask(true);
				return new Group(clip, item);
			}
		},

		gradientTransform: applyTransform,
		transform: applyTransform,

		opacity: function(item, value) {
			// http://www.w3.org/TR/SVG/masking.html#OpacityProperty
			item.setOpacity(parseFloat(value));
		},

		'fill-opacity': applyOpacity,
		'stroke-opacity': applyOpacity,

		'font-family': function(item, value) {
			item.setFont(value.split(',')[0].replace(/^\s+|\s+$/g, ''));
		},

		'font-size': function(item, value) {
			item.setFontSize(parseFloat(value));
		},

		'text-anchor': function(item, value) {
			// http://www.w3.org/TR/SVG/text.html#TextAnchorProperty
			item.setJustification({
				start: 'left',
				middle: 'center',
				end: 'right'
			}[value]);
		},

		visibility: function(item, value) {
			item.setVisible(value === 'visible');
		},

		'stop-color': function(item, value) {
			// http://www.w3.org/TR/SVG/pservers.html#StopColorProperty
			item.setColor(value);
		},

		'stop-opacity': function(item, value) {
			// http://www.w3.org/TR/SVG/pservers.html#StopOpacityProperty
			// NOTE: It is important that this is applied after stop-color!
			if (item._color)
				item._color.setAlpha(parseFloat(value));
		},

		offset: function(item, value) {
			// http://www.w3.org/TR/SVG/pservers.html#StopElementOffsetAttribute
			var percentage = value.match(/(.*)%$/);
			item.setRampPoint(percentage ? percentage[1] / 100 : value);
		},

		viewBox: function(item, value, name, node, styles) {
			// http://www.w3.org/TR/SVG/coords.html#ViewBoxAttribute
			// TODO: implement preserveAspectRatio attribute
			// viewBox will be applied both to the group that's created for the
			// content in Symbol.definition, and the Symbol itself.
			var rect = Rectangle.create.apply(this, convertValue(value, 'array')),
				size = getSize(node, 'width', 'height', true);
			if (item instanceof Group) {
				// This is either a top-level svg node, or the container for a
				// symbol.
				var scale = size ? rect.getSize().divide(size) : 1,
					matrix = new Matrix().translate(rect.getPoint()).scale(scale);
				item.transform(matrix.inverted());
			} else if (item instanceof Symbol) {
				// The symbol is wrapping a group. Note that viewBox was already
				// applied to the group, and above code was executed for it.
				// All that is left to handle here on the Symbol level is
				// clipping. We can't do it at group level because
				// applyAttributes() gets called for groups before their
				// children are added, for styling reasons. See importGroup()
				if (size)
					rect.setSize(size);
				var clip = getAttribute(node, 'overflow', styles) != 'visible',
					group = item._definition;
				if (clip && !rect.contains(group.getBounds())) {
					// Add a clip path at the top of this symbol's group
					clip = new Path.Rectangle(rect).transform(group._matrix);
					clip.setClipMask(true);
					group.addChild(clip);
				}
			}
		}
	});

	function getAttribute(node, name, styles) {
		// First see if the given attribute is defined.
		var attr = node.attributes[name],
			value = attr && attr.value;
		if (!value) {
			// Fallback to using styles. See if there is a style, either set
			// directly on the object or applied to it through CSS rules.
			// We also need to filter out inheritance from their parents.
			var style = Base.camelize(name);
			value = node.style[style];
			if (!value && styles.node[style] !== styles.parent[style])
				value = styles.node[style];
		}
		// Return undefined if attribute is not defined, but null if it's
		// defined as not set (e.g. fill / stroke).
		return !value
				? undefined
				: value === 'none'
					? null
					: value;
	}

	/**
	 * Converts various SVG styles and attributes into Paper.js styles and
	 * attributes and applies them to the passed item.
	 *
	 * @param {SVGSVGElement} node an SVG node to read style and attributes from.
	 * @param {Item} item the item to apply the style and attributes to.
	 */
	function applyAttributes(item, node) {
		// SVG attributes can be set both as styles and direct node attributes,
		// so we need to handle both.
		var styles = {
			node: DomElement.getStyles(node) || {},
			parent: DomElement.getStyles(node.parentNode) || {}
		};
		Base.each(attributes, function(apply, name) {
			var value = getAttribute(node, name, styles);
			if (value !== undefined)
				item = Base.pick(apply(item, value, name, node, styles), item);
		});
		return item;
	}

	var definitions = {};
	function getDefinition(value) {
		// When url() comes from a style property, '#'' seems to be missing on 
		// WebKit, so let's make it optional here:
		var match = value && value.match(/\((?:#|)([^)']+)/);
        return match && definitions[match[1]];
	}

	function importSvg(node, clearDefs) {
		var type = node.nodeName,
			importer = importers[type],
			item = importer && importer(node, type),
			data = node.getAttribute('data-paper-data');
		// See importGroup() for an explanation of this filtering:
		if (item && item._type !== 'group')
			item = applyAttributes(item, node);
		if (item && data)
			item._data = JSON.parse(data);
		// Clear definitions at the end of import?
		if (clearDefs)
			definitions = {};
		return item;
	}

	Item.inject(/** @lends Item# */{
		/**
		 * Converts the passed node node into a Paper.js item and adds it to the
		 * children of this item.
		 *
		 * @param {SVGSVGElement} node the SVG DOM node to convert
		 * @return {Item} the converted Paper.js item
		 */
		importSvg: function(node) {
			return this.addChild(importSvg(node, true));
		}
	});

	Project.inject(/** @lends Project# */{
		/**
		 * Converts the passed node node into a Paper.js item and adds it to the
		 * active layer of this project.
		 *
		 * @param {SVGSVGElement} node the SVG DOM node to convert
		 * @return {Item} the converted Paper.js item
		 */
		importSvg: function(node) {
			this.activate();
			return importSvg(node, true);
		}
	});
};
