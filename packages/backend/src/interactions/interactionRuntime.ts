import type { InteractionModel } from "./interactionTypes";
import { triggerDomEventByType } from "./triggerMapping";

const escapeScriptJson = (value: string) =>
  value
    .replace(/</g, "\\u003C")
    .replace(/>/g, "\\u003E")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

export const interactionRuntimeCSS = `
[data-fig-page][hidden] {
  display: none !important;
}

[data-fig-id] {
  box-sizing: border-box;
}

[data-fig-overlay-root] {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  pointer-events: none;
}

[data-fig-overlay-root] > * {
  pointer-events: auto;
}
`.trim();

export const interactionRuntimeScript = `
(function () {
  var modelElement = document.getElementById("figma-interaction-model");
  if (!modelElement) return;

  var model = JSON.parse(modelElement.textContent || "{}");
  var nodeById = new Map((model.nodes || []).map(function (node) {
    return [node.id, node];
  }));
  var nodePageById = new Map((model.nodes || []).map(function (node) {
    return [node.id, node.pageId || null];
  }));
  var pageById = new Map();
  var history = [];
  var timeoutHandles = [];
  var currentPageId = model.initialPageId || null;
  var overlayRoot = document.querySelector("[data-fig-overlay-root]");
  var triggerEvents = ${JSON.stringify(triggerDomEventByType, null, 2)};
  var state = {
    variables: {},
    modes: {}
  };
  var diagnostics = {
    bound: 0,
    missingSources: [],
    missingDestinations: []
  };
  window.__figmaInteractionModel = model;
  window.__figmaInteractionState = state;
  window.__figmaInteractionDiagnostics = diagnostics;

  if (!overlayRoot) {
    overlayRoot = document.createElement("div");
    overlayRoot.setAttribute("data-fig-overlay-root", "");
    document.body.appendChild(overlayRoot);
  }

  function elementsByData(name) {
    return Array.prototype.slice.call(document.querySelectorAll("[" + name + "]"));
  }

  function findByData(name, value) {
    var elements = elementsByData(name);
    for (var index = 0; index < elements.length; index += 1) {
      if (elements[index].getAttribute(name) === value) {
        return elements[index];
      }
    }
    return null;
  }

  function getTemplateRoot(templateId) {
    var template = document.querySelector('template[data-fig-template="' + CSS.escape(templateId) + '"]');
    if (!template || !template.content || !template.content.firstElementChild) return null;
    var root = template.content.firstElementChild.cloneNode(true);
    root.removeAttribute("data-fig-page");
    return root;
  }

  function getPages() {
    return elementsByData("data-fig-page");
  }

  function refreshPages() {
    pageById.clear();
    getPages().forEach(function (page) {
      pageById.set(page.getAttribute("data-fig-page"), page);
    });
  }

  function normalizeDuration(duration) {
    if (typeof duration !== "number" || !isFinite(duration)) return 0;
    return duration > 0 && duration <= 10 ? duration * 1000 : duration;
  }

  function easingToCSS(easing) {
    if (!easing || !easing.type) return "ease";
    if (easing.type === "LINEAR") return "linear";
    if (easing.type === "EASE_IN") return "ease-in";
    if (easing.type === "EASE_OUT") return "ease-out";
    if (easing.type === "EASE_IN_AND_OUT") return "ease-in-out";
    if (easing.type === "SLOW") return "cubic-bezier(0.2, 0, 0, 1)";
    if (easing.type === "CUSTOM_CUBIC_BEZIER" && easing.easingFunctionCubicBezier) {
      var c = easing.easingFunctionCubicBezier;
      return "cubic-bezier(" + c.x1 + ", " + c.y1 + ", " + c.x2 + ", " + c.y2 + ")";
    }
    return "ease";
  }

  function directionOffset(direction) {
    switch (direction) {
      case "LEFT":
        return ["100%", "0"];
      case "RIGHT":
        return ["-100%", "0"];
      case "TOP":
        return ["0", "100%"];
      case "BOTTOM":
        return ["0", "-100%"];
      default:
        return ["0", "0"];
    }
  }

  function clearTimeouts() {
    timeoutHandles.forEach(function (handle) {
      window.clearTimeout(handle);
    });
    timeoutHandles = [];
  }

  function setPageVisible(page, visible) {
    if (!page) return;
    if (visible) {
      page.hidden = false;
      page.removeAttribute("aria-hidden");
    } else {
      page.hidden = true;
      page.setAttribute("aria-hidden", "true");
    }
  }

  function transitionPages(fromPage, toPage, transition, done) {
    var duration = normalizeDuration(transition && transition.duration);
    var easing = easingToCSS(transition && transition.easing);
    var type = transition && transition.type;

    if (!fromPage || !toPage || duration <= 0 || type === "INSTANT") {
      if (fromPage) setPageVisible(fromPage, false);
      setPageVisible(toPage, true);
      done();
      return;
    }

    setPageVisible(toPage, true);
    fromPage.style.transition = "opacity " + duration + "ms " + easing + ", transform " + duration + "ms " + easing;
    toPage.style.transition = "opacity " + duration + "ms " + easing + ", transform " + duration + "ms " + easing;
    fromPage.style.opacity = "1";
    toPage.style.opacity = "0";

    if (type === "MOVE_IN" || type === "MOVE_OUT" || type === "PUSH" || type === "SLIDE_IN" || type === "SLIDE_OUT") {
      var offset = directionOffset(transition.direction);
      toPage.style.transform = "translate(" + offset[0] + ", " + offset[1] + ")";
      window.requestAnimationFrame(function () {
        fromPage.style.opacity = type === "PUSH" ? "1" : "0";
        fromPage.style.transform = type === "PUSH" ? "translate(" + (offset[0].charAt(0) === "-" ? "100%" : "-100%") + ", " + (offset[1].charAt(0) === "-" ? "100%" : "-100%") + ")" : "translate(0, 0)";
        toPage.style.opacity = "1";
        toPage.style.transform = "translate(0, 0)";
      });
    } else {
      // SMART_ANIMATE is approximated as dissolve here. Full Figma parity requires layer geometry that static HTML cannot always preserve.
      window.requestAnimationFrame(function () {
        fromPage.style.opacity = "0";
        toPage.style.opacity = "1";
      });
    }

    window.setTimeout(function () {
      setPageVisible(fromPage, false);
      fromPage.style.transition = "";
      fromPage.style.opacity = "";
      fromPage.style.transform = "";
      toPage.style.transition = "";
      toPage.style.opacity = "";
      toPage.style.transform = "";
      done();
    }, duration);
  }

  function schedulePageTimeouts() {
    clearTimeouts();
    (model.reactions || []).forEach(function (reaction) {
      if (!reaction.trigger || reaction.trigger.type !== "AFTER_TIMEOUT") return;
      if (reaction.sourcePageId && reaction.sourcePageId !== currentPageId) return;

      var timeout = reaction.trigger.timeout || reaction.trigger.delay || 0;
      timeoutHandles.push(window.setTimeout(function () {
        runActions(reaction.actions || [], reaction);
      }, timeout));
    });
  }

  function showPage(pageId, transition, pushHistory) {
    refreshPages();
    var resolvedPageId = pageById.has(pageId) ? pageId : nodePageById.get(pageId);
    var nextPage = resolvedPageId ? pageById.get(resolvedPageId) : null;
    if (!nextPage) {
      var destination = findByData("data-fig-id", pageId);
      if (destination && typeof destination.scrollIntoView === "function") {
        destination.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      } else {
        diagnostics.missingDestinations.push(pageId);
        console.warn("[Figma interactions] Destination was not exported or cannot be found:", pageId);
      }
      return;
    }

    var previousPage = currentPageId ? pageById.get(currentPageId) : null;
    if (previousPage === nextPage) return;

    if (pushHistory && currentPageId) {
      history.push(currentPageId);
    }

    currentPageId = resolvedPageId;
    transitionPages(previousPage, nextPage, transition, schedulePageTimeouts);
  }

  function showOverlay(destinationId, action) {
    var destination = pageById.get(destinationId) || pageById.get(nodePageById.get(destinationId)) || findByData("data-fig-id", destinationId);
    if (!destination) return;

    var clone = destination.cloneNode(true);
    clone.hidden = false;
    clone.removeAttribute("aria-hidden");
    clone.removeAttribute("data-fig-page");
    clone.setAttribute("data-fig-overlay", destinationId);
    clone.style.position = "absolute";

    if (action.overlayRelativePosition) {
      clone.style.left = action.overlayRelativePosition.x + "px";
      clone.style.top = action.overlayRelativePosition.y + "px";
    } else {
      clone.style.left = "50%";
      clone.style.top = "50%";
      clone.style.transform = "translate(-50%, -50%)";
    }

    overlayRoot.appendChild(clone);
  }

  function closeOverlay() {
    var lastOverlay = overlayRoot.lastElementChild;
    if (lastOverlay) {
      lastOverlay.remove();
    }
  }

  function changeTo(destinationId, action) {
    var existingDestination = findByData("data-fig-id", destinationId);
    var destination = existingDestination || getTemplateRoot(destinationId);
    if (!destination) {
      diagnostics.missingDestinations.push(destinationId);
      console.warn("[Figma interactions] CHANGE_TO destination was not exported or cannot be found:", destinationId);
      return;
    }

    if (!existingDestination) {
      var target = findChangeTarget(this && this.sourceId);
      if (target) {
        animateChangeTo(target, destination, destinationId, action, this && this.sourceId);
      }
      return;
    }

    if (!destination.parentElement) return;

    Array.prototype.slice.call(destination.parentElement.children).forEach(function (sibling) {
      if (sibling.hasAttribute("data-fig-id")) {
        sibling.hidden = true;
      }
    });
    destination.hidden = false;
  }

  function commitChangeTo(target, destination, destinationId) {
    target.innerHTML = destination.innerHTML;
    target.setAttribute("data-fig-current-variant-id", destinationId);
    bindAllReactions();
  }

  function setupChangeLayer(layer) {
    layer.style.position = "absolute";
    layer.style.left = "0";
    layer.style.top = "0";
    layer.style.width = "100%";
    layer.style.height = "100%";
    layer.style.pointerEvents = "none";
    layer.style.willChange = "transform";
  }

  function parsePixelValue(value) {
    var parsed = Number(String(value || "").replace("px", ""));
    return isFinite(parsed) ? parsed : 0;
  }

  function elementMetric(element, property) {
    var inlineValue = parsePixelValue(element && element.style && element.style[property]);
    if (inlineValue) return inlineValue;
    var rect = element && typeof element.getBoundingClientRect === "function" ? element.getBoundingClientRect() : null;
    return rect ? rect[property] || 0 : 0;
  }

  function isControlLikeLayer(element) {
    var name = [
      element.getAttribute("data-layer") || "",
      element.getAttribute("class") || "",
      element.getAttribute("data-fig-id") || ""
    ].join(" ").toLowerCase();

    return (
      name.indexOf("page") >= 0 ||
      name.indexOf("pagination") >= 0 ||
      name.indexOf("btn") >= 0 ||
      name.indexOf("button") >= 0 ||
      name.indexOf("arrow") >= 0 ||
      name.indexOf("left") >= 0 ||
      name.indexOf("right") >= 0
    );
  }

  function layerIdentity(element) {
    return (
      element.getAttribute("data-layer") ||
      element.getAttribute("class") ||
      element.getAttribute("data-fig-id") ||
      ""
    );
  }

  function isViewportCandidate(element, targetWidth, targetHeight) {
    if (!element || isControlLikeLayer(element)) return false;
    var width = elementMetric(element, "width");
    var height = elementMetric(element, "height");
    var left = parsePixelValue(element.style && element.style.left);
    var top = parsePixelValue(element.style && element.style.top);
    var minWidth = targetWidth ? targetWidth * 0.45 : 1;
    var minHeight = targetHeight ? targetHeight * 0.45 : 1;

    return width >= minWidth && height >= minHeight && Math.abs(left) <= Math.max(12, targetWidth * 0.08) && Math.abs(top) <= Math.max(12, targetHeight * 0.08);
  }

  function findChangeViewportPair(target, destination) {
    var targetWidth = target.getBoundingClientRect().width || parsePixelValue(target.style.width);
    var targetHeight = target.getBoundingClientRect().height || parsePixelValue(target.style.height);
    var targetChildren = Array.prototype.slice.call(target.children || []);
    var destinationChildren = Array.prototype.slice.call(destination.children || []);
    var candidates = targetChildren
      .filter(function (child) {
        return isViewportCandidate(child, targetWidth, targetHeight);
      })
      .sort(function (a, b) {
        return elementMetric(b, "width") * elementMetric(b, "height") - elementMetric(a, "width") * elementMetric(a, "height");
      });

    for (var index = 0; index < candidates.length; index += 1) {
      var sourceChild = candidates[index];
      var sourceIdentity = layerIdentity(sourceChild);
      var destinationChild =
        destinationChildren.find(function (child) {
          return layerIdentity(child) === sourceIdentity && isViewportCandidate(child, targetWidth, targetHeight);
        }) ||
        destinationChildren.find(function (child) {
          return isViewportCandidate(child, targetWidth, targetHeight);
        });

      if (destinationChild) {
        return {
          source: sourceChild,
          destination: destinationChild
        };
      }
    }

    return null;
  }

  function inferChangeDirection(target, sourceId) {
    var sourceNode = nodeById.get(sourceId);
    var sourceName = ((sourceNode && sourceNode.name) || "").toLowerCase();
    if (sourceName.indexOf("left") >= 0 || sourceName.indexOf("prev") >= 0 || sourceName.indexOf("back") >= 0) {
      return "backward";
    }
    if (sourceName.indexOf("right") >= 0 || sourceName.indexOf("next") >= 0) {
      return "forward";
    }

    if (sourceNode && typeof sourceNode.x === "number" && typeof sourceNode.width === "number") {
      var targetWidth = target.getBoundingClientRect().width || Number(target.style.width.replace("px", "")) || 0;
      if (targetWidth > 0 && sourceNode.x + sourceNode.width / 2 < targetWidth / 2) {
        return "backward";
      }
    }

    return "forward";
  }

  function animateChangeTo(target, destination, destinationId, action, sourceId) {
    var transition = action && action.transition;
    var duration = normalizeDuration(transition && transition.duration);
    var type = transition && transition.type;

    if (!transition || duration <= 0 || type === "INSTANT") {
      commitChangeTo(target, destination, destinationId);
      return;
    }

    if (target.__figmaChangeToAnimating) {
      target.__figmaChangeToAnimating = false;
      commitChangeTo(target, destination, destinationId);
      return;
    }

    target.__figmaChangeToAnimating = true;

    var direction = inferChangeDirection(target, sourceId);
    var enterOffset = direction === "backward" ? "-100%" : "100%";
    var exitOffset = direction === "backward" ? "100%" : "-100%";
    var easing = easingToCSS(transition.easing);
    var originalPosition = window.getComputedStyle(target).position;

    if (originalPosition === "static") {
      target.style.position = "relative";
    }

    var viewportPair = findChangeViewportPair(target, destination);
    if (viewportPair) {
      animateChangeViewport(target, viewportPair.source, viewportPair.destination, destination, destinationId, duration, easing, enterOffset, exitOffset);
      return;
    }

    var previousLayer = document.createElement("div");
    var nextLayer = document.createElement("div");
    setupChangeLayer(previousLayer);
    setupChangeLayer(nextLayer);

    while (target.firstChild) {
      previousLayer.appendChild(target.firstChild);
    }

    nextLayer.innerHTML = destination.innerHTML;
    nextLayer.style.transform = "translate3d(" + enterOffset + ", 0, 0)";
    previousLayer.style.transform = "translate3d(0, 0, 0)";

    target.appendChild(previousLayer);
    target.appendChild(nextLayer);

    var transitionValue = "transform " + duration + "ms " + easing;
    previousLayer.style.transition = transitionValue;
    nextLayer.style.transition = transitionValue;

    window.requestAnimationFrame(function () {
      previousLayer.style.transform = "translate3d(" + exitOffset + ", 0, 0)";
      nextLayer.style.transform = "translate3d(0, 0, 0)";
    });

    window.setTimeout(function () {
      target.__figmaChangeToAnimating = false;
      commitChangeTo(target, destination, destinationId);
    }, duration);
  }

  function animateChangeViewport(target, sourceViewport, destinationViewport, destination, destinationId, duration, easing, enterOffset, exitOffset) {
    var host = document.createElement("div");
    var previousLayer = document.createElement("div");
    var nextLayer = document.createElement("div");
    var referenceNode = sourceViewport.nextSibling;

    host.style.cssText = sourceViewport.style.cssText;
    host.style.overflow = "hidden";
    host.style.pointerEvents = "none";
    host.setAttribute("data-fig-change-viewport", "");

    setupChangeLayer(previousLayer);
    setupChangeLayer(nextLayer);

    previousLayer.appendChild(sourceViewport);
    nextLayer.appendChild(destinationViewport.cloneNode(true));
    nextLayer.style.transform = "translate3d(" + enterOffset + ", 0, 0)";
    previousLayer.style.transform = "translate3d(0, 0, 0)";

    host.appendChild(previousLayer);
    host.appendChild(nextLayer);
    target.insertBefore(host, referenceNode);

    var transitionValue = "transform " + duration + "ms " + easing;
    previousLayer.style.transition = transitionValue;
    nextLayer.style.transition = transitionValue;

    window.requestAnimationFrame(function () {
      previousLayer.style.transform = "translate3d(" + exitOffset + ", 0, 0)";
      nextLayer.style.transform = "translate3d(0, 0, 0)";
    });

    window.setTimeout(function () {
      target.__figmaChangeToAnimating = false;
      commitChangeTo(target, destination, destinationId);
    }, duration);
  }

  function getChangeDestination(destinationId) {
    return findByData("data-fig-id", destinationId) || getTemplateRoot(destinationId);
  }

  function getPrimaryChangeAction(reaction) {
    var actions = reaction.actions || [];
    for (var index = 0; index < actions.length; index += 1) {
      if (actions[index] && actions[index].type === "NODE" && actions[index].navigation === "CHANGE_TO" && actions[index].destinationId) {
        return actions[index];
      }
    }
    return null;
  }

  function hasClickReaction(sourceId) {
    return (model.reactions || []).some(function (reaction) {
      return reaction.sourceId === sourceId && reaction.trigger && (reaction.trigger.type === "ON_CLICK" || reaction.trigger.type === "ON_PRESS");
    });
  }

  function isNestedClickTarget(event, source) {
    if (!event || !event.target || !source || typeof event.target.closest !== "function") return false;
    var current = event.target.closest("[data-fig-id]");

    while (current && current !== source) {
      var sourceId = current.getAttribute("data-fig-id");
      if (sourceId && hasClickReaction(sourceId)) {
        return true;
      }
      current = current.parentElement && typeof current.parentElement.closest === "function" ? current.parentElement.closest("[data-fig-id]") : null;
    }

    return false;
  }

  function createDragChangeState(reaction, action, initialDeltaX) {
    var destination = getChangeDestination(action.destinationId);
    var target = findChangeTarget(reaction.sourceId);
    if (!destination || !target || target.__figmaChangeToAnimating) return null;

    var viewportPair = findChangeViewportPair(target, destination);
    if (!viewportPair) return null;

    var transition = action.transition || {};
    var duration = normalizeDuration(transition.duration) || 240;
    var easing = easingToCSS(transition.easing);
    var width = viewportPair.source.getBoundingClientRect().width || parsePixelValue(viewportPair.source.style.width) || target.getBoundingClientRect().width || parsePixelValue(target.style.width);
    if (!width) return null;

    var direction = initialDeltaX < 0 ? "forward" : "backward";
    var enterStart = direction === "forward" ? width : -width;
    var exitEnd = direction === "forward" ? -width : width;
    var host = document.createElement("div");
    var previousLayer = document.createElement("div");
    var nextLayer = document.createElement("div");
    var referenceNode = viewportPair.source.nextSibling;

    target.__figmaChangeToAnimating = true;
    host.style.cssText = viewportPair.source.style.cssText;
    host.style.overflow = "hidden";
    host.style.pointerEvents = "none";
    host.setAttribute("data-fig-change-viewport", "");
    host.setAttribute("data-fig-drag-viewport", "");

    setupChangeLayer(previousLayer);
    setupChangeLayer(nextLayer);
    previousLayer.appendChild(viewportPair.source);
    nextLayer.appendChild(viewportPair.destination.cloneNode(true));
    host.appendChild(previousLayer);
    host.appendChild(nextLayer);
    target.insertBefore(host, referenceNode);

    var state = {
      target: target,
      destination: destination,
      destinationId: action.destinationId,
      sourceViewport: viewportPair.source,
      host: host,
      previousLayer: previousLayer,
      nextLayer: nextLayer,
      width: width,
      direction: direction,
      enterStart: enterStart,
      exitEnd: exitEnd,
      duration: duration,
      easing: easing,
      progress: 0
    };

    updateDragChangeState(state, initialDeltaX);
    return state;
  }

  function updateDragChangeState(state, deltaX) {
    var progress = state.direction === "forward" ? Math.max(0, Math.min(state.width, -deltaX)) : Math.max(0, Math.min(state.width, deltaX));
    state.progress = progress;
    state.previousLayer.style.transition = "";
    state.nextLayer.style.transition = "";
    state.previousLayer.style.transform = "translate3d(" + (state.direction === "forward" ? -progress : progress) + "px, 0, 0)";
    state.nextLayer.style.transform = "translate3d(" + (state.enterStart + (state.direction === "forward" ? -progress : progress)) + "px, 0, 0)";
  }

  function finishDragChangeState(state) {
    var shouldCommit = state.progress >= Math.max(60, state.width * 0.22);
    var releaseDuration = Math.min(Math.max(state.duration * 0.45, 160), 420);
    var transitionValue = "transform " + releaseDuration + "ms " + state.easing;

    state.previousLayer.style.transition = transitionValue;
    state.nextLayer.style.transition = transitionValue;

    if (shouldCommit) {
      state.previousLayer.style.transform = "translate3d(" + state.exitEnd + "px, 0, 0)";
      state.nextLayer.style.transform = "translate3d(0, 0, 0)";
      window.setTimeout(function () {
        state.target.__figmaChangeToAnimating = false;
        commitChangeTo(state.target, state.destination, state.destinationId);
      }, releaseDuration);
      return;
    }

    state.previousLayer.style.transform = "translate3d(0, 0, 0)";
    state.nextLayer.style.transform = "translate3d(" + state.enterStart + "px, 0, 0)";
    window.setTimeout(function () {
      state.target.insertBefore(state.sourceViewport, state.host);
      state.host.remove();
      state.target.__figmaChangeToAnimating = false;
    }, releaseDuration);
  }

  function findChangeTarget(sourceId) {
    var sourceNode = nodeById.get(sourceId);
    var current = sourceNode && sourceNode.parentId ? nodeById.get(sourceNode.parentId) : sourceNode;
    var sourceElement = findByData("data-fig-id", sourceId);

    while (current) {
      if (current.type === "INSTANCE" || current.type === "COMPONENT" || current.type === "COMPONENT_SET") {
        var element = findByData("data-fig-id", current.id);
        if (element) return element;
        if (sourceElement && typeof sourceElement.closest === "function") {
          var renderedVariant = sourceElement.closest('[data-fig-current-variant-id="' + CSS.escape(current.id) + '"]');
          if (renderedVariant) return renderedVariant;
        }
      }
      current = current.parentId ? nodeById.get(current.parentId) : null;
    }

    return findByData("data-fig-id", sourceId);
  }

  function findSourceElement(sourceId) {
    return findByData("data-fig-id", sourceId) || findByData("data-fig-current-variant-id", sourceId);
  }

  function runAction(action, reaction) {
    if (!action || !action.type) return;

    if (action.type === "SET_VARIABLE" && action.variableId) {
      state.variables[action.variableId] = resolveVariableData(action.variableValue);
      updateBoundStateElements(action.variableId, state.variables[action.variableId]);
      return;
    }

    if (action.type === "SET_VARIABLE_MODE" && action.variableCollectionId) {
      state.modes[action.variableCollectionId] = action.variableModeId || null;
      return;
    }

    if (action.type === "CONDITIONAL" && Array.isArray(action.conditionalBlocks)) {
      for (var blockIndex = 0; blockIndex < action.conditionalBlocks.length; blockIndex += 1) {
        var block = action.conditionalBlocks[blockIndex];
        if (!block.condition || Boolean(resolveVariableData(block.condition))) {
          runActions(block.actions || [], reaction);
          break;
        }
      }
      return;
    }

    if (action.type === "URL" && action.url) {
      var opened = window.open(action.url, "_blank", "noopener");
      if (!opened) window.location.href = action.url;
      return;
    }

    if (action.type === "BACK") {
      var previousPageId = history.pop();
      if (previousPageId) showPage(previousPageId, action.transition, false);
      return;
    }

    if (action.type === "CLOSE") {
      closeOverlay();
      return;
    }

    if (action.type === "NODE" && action.destinationId) {
      if (action.navigation === "OVERLAY") {
        showOverlay(action.destinationId, action);
      } else if (action.navigation === "SCROLL_TO") {
        var target = findByData("data-fig-id", action.destinationId);
        if (target && typeof target.scrollIntoView === "function") {
          target.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
        }
      } else if (action.navigation === "CHANGE_TO") {
        changeTo.call(reaction, action.destinationId, action);
      } else {
        showPage(action.destinationId, action.transition, action.navigation !== "SWAP");
      }
    }
  }

  function resolveVariableData(data) {
    if (!data || typeof data !== "object") return data;

    if (data.type === "VARIABLE_ALIAS" && data.id) {
      return state.variables[data.id];
    }

    if (data.value && typeof data.value === "object" && data.value.type === "VARIABLE_ALIAS") {
      return state.variables[data.value.id];
    }

    if (data.value && typeof data.value === "object" && data.value.expressionFunction) {
      return evaluateExpression(data.value);
    }

    if (data.expressionFunction) {
      return evaluateExpression(data);
    }

    return "value" in data ? data.value : data;
  }

  function evaluateExpression(expression) {
    var args = (expression.expressionArguments || []).map(resolveVariableData);

    switch (expression.expressionFunction) {
      case "ADDITION":
        return args.reduce(function (sum, value) { return sum + Number(value || 0); }, 0);
      case "SUBTRACTION":
        return Number(args[0] || 0) - Number(args[1] || 0);
      case "MULTIPLICATION":
        return args.reduce(function (product, value) { return product * Number(value || 0); }, 1);
      case "DIVISION":
        return Number(args[0] || 0) / Number(args[1] || 1);
      case "EQUALS":
        return args[0] === args[1];
      case "NOT_EQUAL":
        return args[0] !== args[1];
      case "LESS_THAN":
        return Number(args[0]) < Number(args[1]);
      case "LESS_THAN_OR_EQUAL":
        return Number(args[0]) <= Number(args[1]);
      case "GREATER_THAN":
        return Number(args[0]) > Number(args[1]);
      case "GREATER_THAN_OR_EQUAL":
        return Number(args[0]) >= Number(args[1]);
      case "AND":
        return args.every(Boolean);
      case "OR":
        return args.some(Boolean);
      case "NEGATE":
        return -Number(args[0] || 0);
      case "NOT":
        return !args[0];
      case "VAR_MODE_LOOKUP":
        return state.modes[String(args[0])] || null;
      default:
        return args[0];
    }
  }

  function updateBoundStateElements(variableId, value) {
    elementsByData("data-fig-variable").forEach(function (element) {
      if (element.getAttribute("data-fig-variable") !== variableId) return;

      if (element.hasAttribute("data-fig-visible-when")) {
        element.hidden = String(value) !== element.getAttribute("data-fig-visible-when");
      }

      if (element.hasAttribute("data-fig-text-variable")) {
        element.textContent = value == null ? "" : String(value);
      }
    });
  }

  function runActions(actions, reaction) {
    actions.forEach(function (action) {
      runAction(action, reaction);
    });
  }

  function eventNameForTrigger(trigger) {
    return trigger && trigger.type ? triggerEvents[trigger.type] || null : null;
  }

  function bindReaction(reaction) {
    if (!reaction.trigger) return;

    if (reaction.trigger.type === "AFTER_TIMEOUT") {
      return;
    }

    if (reaction.trigger.type === "ON_KEY_DOWN") {
      document.addEventListener("keydown", function (event) {
        var keyCodes = reaction.trigger.keyCodes || [];
        if (keyCodes.length > 0 && keyCodes.indexOf(event.keyCode) === -1) return;
        runActions(reaction.actions || [], reaction);
      });
      return;
    }

    if (reaction.trigger.type === "ON_DRAG") {
      bindDragReaction(reaction);
      return;
    }

    var eventName = eventNameForTrigger(reaction.trigger);
    var source = findSourceElement(reaction.sourceId);
    if (!eventName) return;
    if (!source) {
      diagnostics.missingSources.push(reaction.sourceId);
      console.warn("[Figma interactions] Source node was not exported or cannot be found:", reaction.sourceId);
      return;
    }

    source.__figmaInteractionBindings = source.__figmaInteractionBindings || {};
    var bindingKey = reaction.sourceId + ":" + eventName;
    if (source.__figmaInteractionBindings[bindingKey]) return;
    source.__figmaInteractionBindings[bindingKey] = true;

    source.style.cursor = source.style.cursor || "pointer";
    source.addEventListener(eventName, function () {
      var delay = reaction.trigger.delay || 0;
      if (delay > 0) {
        window.setTimeout(function () {
          runActions(reaction.actions || [], reaction);
        }, delay);
      } else {
        runActions(reaction.actions || [], reaction);
      }
    });
    diagnostics.bound += 1;
  }

  function bindDragReaction(reaction) {
    var source = findSourceElement(reaction.sourceId);
    if (!source) {
      diagnostics.missingSources.push(reaction.sourceId);
      console.warn("[Figma interactions] Source node was not exported or cannot be found:", reaction.sourceId);
      return;
    }

    source.__figmaInteractionBindings = source.__figmaInteractionBindings || {};
    var bindingKey = reaction.sourceId + ":drag";
    if (source.__figmaInteractionBindings[bindingKey]) return;
    source.__figmaInteractionBindings[bindingKey] = true;

    var startX = 0;
    var startY = 0;
    var active = false;
    var fired = false;
    var dragState = null;
    var dragAction = getPrimaryChangeAction(reaction);

    source.style.cursor = source.style.cursor || "grab";
    source.style.touchAction = source.style.touchAction || "pan-y";

    source.addEventListener("pointerdown", function (event) {
      if (isNestedClickTarget(event, source)) return;
      active = true;
      fired = false;
      dragState = null;
      startX = event.clientX;
      startY = event.clientY;
      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
      document.addEventListener("pointercancel", handlePointerCancel);
    });

    function cleanupPointerListeners() {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerCancel);
    }

    function handlePointerMove(event) {
      if (!active || fired) return;
      var deltaX = event.clientX - startX;
      var deltaY = event.clientY - startY;
      if (!dragState && Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 10) return;

      if (!dragState && dragAction) {
        dragState = createDragChangeState(reaction, dragAction, deltaX);
      }

      if (dragState) {
        event.preventDefault();
        updateDragChangeState(dragState, deltaX);
        return;
      }

      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 24) return;
      fired = true;
      active = false;
      runActions(reaction.actions || [], reaction);
      cleanupPointerListeners();
    }

    function handlePointerUp() {
      if (dragState) {
        finishDragChangeState(dragState);
      }
      active = false;
      fired = false;
      dragState = null;
      cleanupPointerListeners();
    }

    function handlePointerCancel() {
      if (dragState) {
        finishDragChangeState(dragState);
      }
      active = false;
      fired = false;
      dragState = null;
      cleanupPointerListeners();
    }

    diagnostics.bound += 1;
  }

  function bindAllReactions() {
    (model.reactions || []).forEach(bindReaction);
  }

  refreshPages();
  getPages().forEach(function (page) {
    setPageVisible(page, page.getAttribute("data-fig-page") === currentPageId);
  });
  bindAllReactions();
  if (!(model.reactions || []).length) {
    console.warn("[Figma interactions] No prototype reactions were exported. Check that the selected nodes contain prototype interactions.");
  } else if (diagnostics.bound === 0) {
    console.warn("[Figma interactions] Prototype reactions exist, but no DOM listeners were bound.", diagnostics);
  }
  schedulePageTimeouts();
})();
`.trim();

export const renderInteractionScripts = (model: InteractionModel): string => {
  const serializedModel = escapeScriptJson(JSON.stringify(model, null, 2));

  return `<script type="application/json" id="figma-interaction-model">${serializedModel}</script>
<script>
${interactionRuntimeScript}
</script>`;
};
