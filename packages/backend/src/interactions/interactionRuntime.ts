import type { InteractionModel } from "./interactionTypes";

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

.figma-swiper {
  display: block;
  overflow: hidden;
  position: relative;
  touch-action: pan-y;
  user-select: none;
  width: 100%;
  z-index: 1;
}

.figma-swiper .swiper-wrapper {
  box-sizing: content-box;
  display: flex;
  height: auto;
  position: relative;
  transition-property: transform;
  width: 100%;
  z-index: 1;
}

.figma-swiper .swiper-slide {
  display: block;
  height: auto;
  overflow: hidden;
  position: relative;
  flex-shrink: 0;
  width: 100%;
  transition-property: transform;
}
`.trim();

export const interactionRuntimeScript = `
function getFigmaInteractionModel() {
  var modelElement = document.getElementById("figma-interaction-model");
  if (!modelElement) return null;

  return JSON.parse(modelElement.textContent || "{}");
}

function initializeFigmaInteractions(model) {
  if (!model) return;

  var nodeById = new Map((model.nodes || []).map(function (node) {
    return [node.id, node];
  }));
  var nodePageById = new Map((model.nodes || []).map(function (node) {
    return [node.id, node.pageId || null];
  }));
  var pageById = new Map();
  var currentPageId = model.initialPageId || null;
  var triggerEvents = {
  "ON_CLICK": "click",
  "ON_PRESS": "click"
};
  var runtimeTemplateById = new Map();
  var diagnostics = {
    bound: 0
  };

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

  function findByDataWithin(root, name, value) {
    if (!root || !value) return null;
    if (root.getAttribute && root.getAttribute(name) === value) return root;
    return root.querySelector ? root.querySelector("[" + name + '="' + CSS.escape(value) + '"]') : null;
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

  function transitionPages(fromPage, toPage) {
    if (!toPage) return;
    if (fromPage) setPageVisible(fromPage, false);
    setPageVisible(toPage, true);
  }

  function showPage(pageId, transition) {
    refreshPages();
    var resolvedPageId = pageById.has(pageId) ? pageId : nodePageById.get(pageId);
    var nextPage = resolvedPageId ? pageById.get(resolvedPageId) : null;
    if (!nextPage) {
      var templatePage = getTemplateRoot(pageId);
      if (templatePage) {
        templatePage.setAttribute("data-fig-page", pageId);
        templatePage.hidden = true;
        document.body.appendChild(templatePage);
        refreshPages();
        resolvedPageId = templatePage.getAttribute("data-fig-page") || pageId;
        nextPage = pageById.get(resolvedPageId);
        bindAllReactions();
        window.setTimeout(initFigmaSwiperCarousels, 0);
      }
    }
    if (!nextPage) {
      var destination = findByData("data-fig-id", pageId);
      if (destination && typeof destination.scrollIntoView === "function") {
        destination.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      } else {
        console.warn("[Figma interactions] Destination was not exported or cannot be found:", pageId);
      }
      return;
    }

    var previousPage = currentPageId ? pageById.get(currentPageId) : null;
    if (previousPage === nextPage) return;

    currentPageId = resolvedPageId;
    getPages().forEach(function (page) {
      if (page !== previousPage && page !== nextPage) {
        setPageVisible(page, false);
      }
    });
    transitionPages(previousPage, nextPage);
  }

  function changeTo(destinationId, action) {
    var target = findChangeTarget(this && this.sourceId);
    var existingDestination = findByData("data-fig-id", destinationId);
    var destination = getChangeDestination(destinationId, target);
    if (!destination) {
      console.warn("[Figma interactions] CHANGE_TO destination was not exported or cannot be found:", destinationId);
      return;
    }

    if (!existingDestination || existingDestination === target) {
      if (target && target.__figmaChangeToAnimating) {
        return;
      }
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
    rememberCurrentTemplate(target);
    target.innerHTML = destination.innerHTML;
    target.setAttribute("data-fig-current-variant-id", destinationId);
    bindAllReactions();
  }

  function rememberCurrentTemplate(target) {
    var currentVariantId = target.getAttribute("data-fig-current-variant-id") || target.getAttribute("data-fig-id");
    if (target.querySelector && target.querySelector(".figma-swiper")) {
      return;
    }
    if (currentVariantId && !runtimeTemplateById.has(currentVariantId)) {
      runtimeTemplateById.set(currentVariantId, target.innerHTML);
    }
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

  function isArrowControlLayer(element) {
    var name = [
      element.getAttribute("data-layer") || "",
      element.getAttribute("class") || "",
      element.getAttribute("data-fig-id") || ""
    ].join(" ").toLowerCase();

    return (
      name.indexOf("btn") >= 0 ||
      name.indexOf("button") >= 0 ||
      name.indexOf("arrow") >= 0 ||
      name.indexOf("left") >= 0 ||
      name.indexOf("right") >= 0 ||
      name.indexOf("prev") >= 0 ||
      name.indexOf("next") >= 0
    );
  }

  function isCarouselPrevControl(control) {
    var dataLayer = control.getAttribute("data-layer") || "";
    return (
      control.hasAttribute("data-fig-carousel-prev") ||
      dataLayer === "_HELP_NAV_PREV" ||
      String(control.className || "").indexOf("BtnLeft") >= 0
    );
  }

  function isCarouselNextControl(control) {
    var dataLayer = control.getAttribute("data-layer") || "";
    return (
      control.hasAttribute("data-fig-carousel-next") ||
      dataLayer === "_HELP_NAV_NEXT" ||
      String(control.className || "").indexOf("BtnRight") >= 0
    );
  }

  function getCarouselControls(root) {
    return Array.prototype.slice.call(
      root.querySelectorAll(
        '[data-fig-carousel-next], [data-fig-carousel-prev], [data-layer="_HELP_NAV_NEXT"], [data-layer="_HELP_NAV_PREV"], .BtnRight, .BtnLeft'
      )
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
      return;
    }

    rememberCurrentTemplate(target);
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

  function getRuntimeTemplateRoot(templateId) {
    if (!runtimeTemplateById.has(templateId)) return null;
    var root = document.createElement("div");
    root.innerHTML = runtimeTemplateById.get(templateId);
    return root;
  }

  function getChangeDestination(destinationId, target) {
    var existing = findByData("data-fig-id", destinationId);
    if (existing && existing !== target) {
      return existing;
    }

    if (existing === target && target && target.getAttribute("data-fig-current-variant-id") === destinationId) {
      return existing;
    }

    return getRuntimeTemplateRoot(destinationId) || getTemplateRoot(destinationId) || existing;
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

  function getChangeActions(reaction) {
    return (reaction.actions || []).filter(function (action) {
      return action && action.type === "NODE" && action.navigation === "CHANGE_TO" && action.destinationId;
    });
  }

  function isNodeDescendantOf(nodeId, ancestorId) {
    var current = nodeById.get(nodeId);
    while (current) {
      if (current.id === ancestorId || current.parentId === ancestorId) return true;
      current = current.parentId ? nodeById.get(current.parentId) : null;
    }
    return false;
  }

  function inferNodeDirection(node, target) {
    var name = ((node && node.name) || "").toLowerCase();
    if (name.indexOf("left") >= 0 || name.indexOf("prev") >= 0 || name.indexOf("back") >= 0) {
      return "backward";
    }
    if (name.indexOf("right") >= 0 || name.indexOf("next") >= 0) {
      return "forward";
    }

    if (node && typeof node.x === "number" && typeof node.width === "number") {
      var targetWidth = target.getBoundingClientRect().width || parsePixelValue(target.style.width) || 0;
      if (targetWidth > 0 && node.x + node.width / 2 < targetWidth / 2) {
        return "backward";
      }
    }

    return "forward";
  }

  function findDirectionalActionInRoot(rootId, direction, target) {
    for (var reactionIndex = 0; reactionIndex < (model.reactions || []).length; reactionIndex += 1) {
      var candidateReaction = model.reactions[reactionIndex];
      if (!candidateReaction.trigger || (candidateReaction.trigger.type !== "ON_CLICK" && candidateReaction.trigger.type !== "ON_PRESS")) {
        continue;
      }
      if (!isNodeDescendantOf(candidateReaction.sourceId, rootId)) {
        continue;
      }

      var candidateNode = nodeById.get(candidateReaction.sourceId);
      if (inferNodeDirection(candidateNode, target) !== direction) {
        continue;
      }

      var actions = getChangeActions(candidateReaction);
      if (actions.length > 0) {
        return actions[0];
      }
    }

    return null;
  }

  function findForwardActionForRoot(rootId, target) {
    var action = findDirectionalActionInRoot(rootId, "forward", target);
    if (action) return action;

    for (var reactionIndex = 0; reactionIndex < (model.reactions || []).length; reactionIndex += 1) {
      var candidateReaction = model.reactions[reactionIndex];
      if (
        candidateReaction.sourceId === rootId &&
        candidateReaction.trigger &&
        candidateReaction.trigger.type === "ON_DRAG"
      ) {
        return getPrimaryChangeAction(candidateReaction);
      }
    }

    return null;
  }

  function buildLinearDragChain(startRootId, target) {
    var chain = [startRootId];
    var visited = {};
    visited[startRootId] = true;
    var currentId = startRootId;

    while (currentId) {
      var action = findForwardActionForRoot(currentId, target);
      var destinationId = action && action.destinationId;
      if (!destinationId || visited[destinationId]) break;
      chain.push(destinationId);
      visited[destinationId] = true;
      currentId = destinationId;
    }

    return chain;
  }

  function findDragChainForCurrentRoot(currentRootId, target) {
    var candidates = [target.getAttribute("data-fig-id"), currentRootId].filter(Boolean);

    for (var nodeIndex = 0; nodeIndex < (model.nodes || []).length; nodeIndex += 1) {
      var node = model.nodes[nodeIndex];
      if (node && node.type === "INSTANCE") {
        candidates.push(node.id);
      }
    }

    for (var index = 0; index < candidates.length; index += 1) {
      var chain = buildLinearDragChain(candidates[index], target);
      if (chain.indexOf(currentRootId) >= 0) {
        return chain;
      }
    }

    return [currentRootId];
  }

  function ensureSwiperLoaded() {
    if (window.Swiper) return Promise.resolve(window.Swiper);
    return Promise.reject(new Error("Swiper is not loaded. Include the official Swiper bundle before initializing Figma interactions."));
  }

  function getCarouselSlideRoots(carouselId, root) {
    var slideRoots = [];
    var currentVariantId = root.getAttribute("data-fig-current-variant-id") || root.getAttribute("data-fig-id");
    var rootId = root.getAttribute("data-fig-id");
    var currentClone = root.cloneNode(true);
    currentClone.setAttribute("data-fig-id", currentVariantId || rootId || carouselId);
    slideRoots.push(currentClone);

    if (rootId && runtimeTemplateById.has(rootId)) {
      var runtimeRoot = getRuntimeTemplateRoot(rootId);
      if (runtimeRoot) {
        runtimeRoot.setAttribute("data-fig-id", rootId);
        slideRoots.push(runtimeRoot);
      }
    }

    Array.prototype.slice.call(document.querySelectorAll('template[data-fig-template]')).forEach(function (template) {
      var candidate = template.content && template.content.firstElementChild ? template.content.firstElementChild.cloneNode(true) : null;
      if (!candidate) return;
      if (candidate.getAttribute("data-fig-carousel") !== carouselId || !candidate.hasAttribute("data-fig-carousel-slide")) return;
      slideRoots.push(candidate);
    });

    if (getUniqueSlideRootCount(slideRoots) < 2) {
      getPrototypeCarouselSlideIds(root, carouselId).forEach(function (slideId) {
        if (!slideId || slideId === currentVariantId || slideId === rootId) return;
        var destination = getChangeDestination(slideId, root);
        if (destination) {
          var clone = destination.cloneNode(true);
          clone.setAttribute("data-fig-id", slideId);
          slideRoots.push(clone);
        }
      });
    }

    var byId = new Map();
    slideRoots.forEach(function (slideRoot) {
      var slideId = slideRoot.getAttribute("data-fig-id");
      if (slideId && !byId.has(slideId)) {
        byId.set(slideId, slideRoot);
      }
    });

    var sortedRoots = Array.from(byId.values()).sort(function (left, right) {
      return Number(left.getAttribute("data-fig-carousel-index") || 0) - Number(right.getAttribute("data-fig-carousel-index") || 0);
    });

    var usedIndexes = {};
    return sortedRoots.filter(function (slideRoot) {
      var index = slideRoot.getAttribute("data-fig-carousel-index");
      if (index == null || index === "") return true;
      if (usedIndexes[index]) return false;
      usedIndexes[index] = true;
      return true;
    });
  }

  function getUniqueSlideRootCount(slideRoots) {
    var byId = {};
    slideRoots.forEach(function (slideRoot) {
      var slideId = slideRoot && slideRoot.getAttribute && slideRoot.getAttribute("data-fig-id");
      if (slideId) byId[slideId] = true;
    });
    return Object.keys(byId).length;
  }

  function getPrototypeRootId(sourceId) {
    var current = nodeById.get(sourceId);
    while (current) {
      if (current.type === "INSTANCE" || current.type === "COMPONENT" || current.type === "COMPONENT_SET") {
        return current.id;
      }
      current = current.parentId ? nodeById.get(current.parentId) : null;
    }
    return sourceId;
  }

  function getPrototypeCarouselSlideIds(root, carouselId) {
    var rootId = root.getAttribute("data-fig-id");
    var activeVariantId = root.getAttribute("data-fig-current-variant-id") || rootId;
    var chain = findDragChainForCurrentRoot(activeVariantId || carouselId || rootId, root);
    var seeds = [carouselId, rootId, activeVariantId].filter(Boolean);
    var ordered = [];
    var seen = {};

    function add(slideId) {
      if (!slideId || seen[slideId]) return;
      seen[slideId] = true;
      ordered.push(slideId);
    }

    chain.forEach(add);
    seeds.forEach(add);

    for (var scan = 0; scan < ordered.length; scan += 1) {
      var currentId = ordered[scan];
      (model.reactions || []).forEach(function (reaction) {
        var sourceRootId = getPrototypeRootId(reaction.sourceId);
        getChangeActions(reaction).forEach(function (action) {
          if (sourceRootId === currentId) add(action.destinationId);
          if (action.destinationId === currentId) add(sourceRootId);
        });
      });
    }

    return ordered;
  }

  function findCarouselViewport(root) {
    var marked = root.querySelector("[data-fig-carousel-viewport]");
    if (marked) return marked;

    var rootId = root.getAttribute("data-fig-id") || root.getAttribute("data-fig-current-variant-id");
    if (!rootId) return null;

    var candidates = [];
    for (var index = 0; index < (model.nodes || []).length; index += 1) {
      var node = model.nodes[index];
      if (!node || node.parentId !== rootId) continue;
      var area = (node.width || 0) * (node.height || 0);
      if (area <= 0) continue;
      candidates.push({ node: node, area: area });
    }

    candidates.sort(function (left, right) {
      return right.area - left.area;
    });

    for (var candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
      var candidate = candidates[candidateIndex].node;
      var element = findByDataWithin(root, "data-fig-id", candidate.id);
      if (element && !isArrowControlLayer(element)) {
        element.setAttribute("data-fig-carousel-viewport", "");
        return element;
      }
    }

    return null;
  }

  function normalizeSwiperViewport(viewport, width, height) {
    var clone = viewport.cloneNode(false);
    clone.style.left = "0";
    clone.style.top = "0";
    clone.style.right = "";
    clone.style.bottom = "";
    clone.style.position = "relative";
    if (!clone.style.width) clone.style.width = width ? width + "px" : "100%";
    if (!clone.style.height && height) clone.style.height = height + "px";
    clone.style.maxWidth = "none";
    clone.style.minWidth = "0";
    clone.innerHTML = "";

    var viewportRect = viewport.getBoundingClientRect();
    var viewportWidth = width || viewportRect.width || parsePixelValue(viewport.style.width) || 0;
    var viewportHeight = height || viewportRect.height || parsePixelValue(viewport.style.height) || 0;
    var appended = false;

    Array.prototype.slice.call(viewport.children || []).forEach(function (child) {
      var childRect = child.getBoundingClientRect();
      var left = childRect.left - viewportRect.left;
      var top = childRect.top - viewportRect.top;
      var childWidth = childRect.width || parsePixelValue(child.style.width) || viewportWidth;
      var childHeight = childRect.height || parsePixelValue(child.style.height) || viewportHeight;
      var right = left + childWidth;
      var bottom = top + childHeight;
      var visible = right > 0 && bottom > 0 && left < viewportWidth && top < viewportHeight;

      if (!visible) return;

      var childClone = child.cloneNode(true);
      if (!childClone.style.left) childClone.style.left = left + "px";
      if (!childClone.style.top) childClone.style.top = top + "px";
      clone.appendChild(childClone);
      appended = true;
    });

    if (!appended) {
      Array.prototype.slice.call(viewport.childNodes || []).forEach(function (child) {
        clone.appendChild(child.cloneNode(true));
      });
    }

    return clone;
  }

  function initFigmaSwiperCarousel(root, SwiperConstructor) {
    if (!root) {
      return;
    }
    if (root.__figmaSwiperInitialized) return;
    if (root.__figmaChangeToAnimating) {
      return;
    }

    var carouselId = root.getAttribute("data-fig-carousel");
    var activeVariantId = root.getAttribute("data-fig-current-variant-id") || root.getAttribute("data-fig-id");
    var activeViewport = findCarouselViewport(root);
    if (!carouselId) {
      return;
    }
    if (!activeViewport) {
      return;
    }

    var slideRoots = getCarouselSlideRoots(carouselId, root);
    if (slideRoots.length < 2) {
      return;
    }

    var activeIndex = slideRoots.findIndex(function (slideRoot) {
      return slideRoot.getAttribute("data-fig-id") === activeVariantId;
    });
    if (activeIndex < 0) activeIndex = 0;

    rememberCurrentTemplate(root);

    var viewportRect = activeViewport.getBoundingClientRect();
    var viewportWidth =
      viewportRect.width ||
      parsePixelValue(activeViewport.style.width) ||
      activeViewport.offsetWidth ||
      parsePixelValue(root.style.width) ||
      root.getBoundingClientRect().width;
    var viewportHeight =
      viewportRect.height ||
      parsePixelValue(activeViewport.style.height) ||
      activeViewport.offsetHeight ||
      parsePixelValue(root.style.height) ||
      root.getBoundingClientRect().height;

    var swiperEl = document.createElement("div");
    var wrapper = document.createElement("div");
    swiperEl.className = "swiper figma-swiper";
    wrapper.className = "swiper-wrapper";
    swiperEl.style.cssText = activeViewport.style.cssText;
    swiperEl.style.display = "block";
    swiperEl.style.height = "auto";
    swiperEl.style.overflow = "hidden";
    swiperEl.style.position = swiperEl.style.position || "relative";
    wrapper.style.boxSizing = "content-box";
    wrapper.style.display = "flex";
    wrapper.style.height = "auto";
    wrapper.style.position = "relative";
    wrapper.style.transitionProperty = "transform";
    wrapper.style.width = "100%";
    swiperEl.setAttribute("data-fig-swiper", carouselId);

    var slideRootById = {};
    slideRoots.forEach(function (slideRoot) {
      var viewport = findCarouselViewport(slideRoot);
      if (!viewport) return;
      var slideRootId = slideRoot.getAttribute("data-fig-id") || "";
      if (slideRootId) {
        slideRootById[slideRootId] = slideRoot;
      }
      var slide = document.createElement("div");
      slide.className = "swiper-slide";
      slide.setAttribute("data-fig-swiper-slide-id", slideRootId);
      slide.style.display = "block";
      slide.style.overflow = "hidden";
      slide.style.position = "relative";
      slide.style.width = "100%";
      slide.style.height = "auto";
      slide.style.flexShrink = "0";
      slide.style.minWidth = "0";
      slide.style.minHeight = "0";
      slide.appendChild(normalizeSwiperViewport(viewport, viewportWidth, viewportHeight));
      wrapper.appendChild(slide);
    });

    if (wrapper.children.length < 2) {
      return;
    }

    activeViewport.replaceWith(swiperEl);
    swiperEl.appendChild(wrapper);
    root.__figmaSwiperInitialized = true;

    var swiperOptions = {
      autoHeight: true,
      grabCursor: true,
      initialSlide: activeIndex,
      resistanceRatio: 0,
      slidesPerView: "auto",
      speed: 420,
      threshold: 8
    };

    var swiper = new SwiperConstructor(swiperEl, swiperOptions);

    root.__figmaSwiper = swiper;
    root.setAttribute("data-fig-swiper-ready", "");

    function getActiveSwiperSlideRoot() {
      var activeSlide =
        swiper.slides && swiper.slides[swiper.activeIndex]
          ? swiper.slides[swiper.activeIndex]
          : swiperEl.querySelector(".swiper-slide-active");
      var activeSlideId = activeSlide && activeSlide.getAttribute ? activeSlide.getAttribute("data-fig-swiper-slide-id") : "";
      return slideRootById[activeSlideId] || slideRoots[swiper.activeIndex] || null;
    }

    function syncSwiperCarouselState() {
      var activeSlideRoot = getActiveSwiperSlideRoot();
      if (activeSlideRoot) {
        root.setAttribute("data-fig-current-variant-id", activeSlideRoot.getAttribute("data-fig-id") || "");
        if (activeSlideRoot.hasAttribute("data-fig-carousel")) {
          root.setAttribute("data-fig-carousel", activeSlideRoot.getAttribute("data-fig-carousel") || "");
        }
        if (activeSlideRoot.hasAttribute("data-fig-carousel-index")) {
          root.setAttribute("data-fig-carousel-index", activeSlideRoot.getAttribute("data-fig-carousel-index") || "0");
        }

        var sourcePagination = activeSlideRoot.querySelector("[data-fig-carousel-pagination]");
        var targetPagination = root.querySelector("[data-fig-carousel-pagination]");
        if (sourcePagination && targetPagination) {
          targetPagination.innerHTML = sourcePagination.innerHTML;
          targetPagination.setAttribute("data-fig-id", sourcePagination.getAttribute("data-fig-id") || "");
          targetPagination.setAttribute("data-fig-carousel", sourcePagination.getAttribute("data-fig-carousel") || "");
          targetPagination.className = sourcePagination.className;
          targetPagination.style.cssText = sourcePagination.style.cssText;
        }
      }

      getCarouselControls(root).forEach(function (control) {
        var isPrev = isCarouselPrevControl(control);
        var isNext = isCarouselNextControl(control);
        if (!isPrev && !isNext) return;
        var disabled = isPrev ? swiper.isBeginning : swiper.isEnd;
        control.style.opacity = disabled ? "0.3" : "1";
        control.style.pointerEvents = disabled ? "none" : "auto";
        control.style.cursor = disabled ? "default" : "pointer";
      });
    }

    getCarouselControls(root).forEach(function (control) {
      control.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (isCarouselPrevControl(control)) {
          swiper.slidePrev();
        } else {
          swiper.slideNext();
        }
      }, true);
    });

    swiper.on("slideChangeTransitionStart", function () {
      root.__figmaChangeToAnimating = true;
    });

    swiper.on("slideChange", function () {
      syncSwiperCarouselState();
    });

    swiper.on("slideChangeTransitionEnd", function () {
      root.__figmaChangeToAnimating = false;
      syncSwiperCarouselState();
    });

    syncSwiperCarouselState();
  }

  function initFigmaSwiperCarousels() {
    var carouselRoots = Array.prototype.slice.call(document.querySelectorAll("[data-fig-carousel-root]"));
    if (carouselRoots.length === 0) return;

    ensureSwiperLoaded()
      .then(function (SwiperConstructor) {
        carouselRoots.forEach(function (root) {
          try {
            initFigmaSwiperCarousel(root, SwiperConstructor);
          } catch (error) {
            console.warn("[Figma interactions] Swiper carousel failed to initialize:", error);
          }
        });
      })
      .catch(function (error) {
        console.warn("[Figma interactions] Swiper failed to load. Carousel click interactions remain available, but Swiper drag is disabled.");
      });
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

    return findSourceElement(sourceId);
  }

  function findSourceElement(sourceId) {
    return findByData("data-fig-id", sourceId) || findByData("data-fig-current-variant-id", sourceId);
  }

  function isReactionActiveForSource(reaction, source) {
    var activeVariantId = source && source.getAttribute && source.getAttribute("data-fig-current-variant-id");
    var sourceId = source && source.getAttribute && source.getAttribute("data-fig-id");

    if (activeVariantId && sourceId === reaction.sourceId && activeVariantId !== reaction.sourceId) {
      return false;
    }

    return true;
  }

  function runAction(action, reaction) {
    if (!action || !action.type) return;

    if (action.type === "NODE" && action.destinationId) {
      if (action.navigation === "CHANGE_TO") {
        changeTo.call(reaction, action.destinationId, action);
      } else {
        showPage(action.destinationId, action.transition);
      }
    }
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

    if (reaction.trigger.type === "ON_DRAG") {
      return;
    }

    var eventName = eventNameForTrigger(reaction.trigger);
    var source = findSourceElement(reaction.sourceId);
    if (!eventName) return;
    if (!source) {
      return;
    }

    source.__figmaInteractionBindings = source.__figmaInteractionBindings || {};
    var bindingKey = reaction.sourceId + ":" + eventName;
    if (source.__figmaInteractionBindings[bindingKey]) return;
    source.__figmaInteractionBindings[bindingKey] = true;

    source.style.cursor = source.style.cursor || "pointer";
    source.addEventListener(eventName, function () {
      if (!isReactionActiveForSource(reaction, source)) return;
      runActions(reaction.actions || [], reaction);
    });
    diagnostics.bound += 1;
  }

  function bindAllReactions() {
    (model.reactions || []).forEach(bindReaction);
  }

  function hasNavigateAction(reaction) {
    return (reaction.actions || []).some(function (action) {
      return action && action.type === "NODE" && action.destinationId && action.navigation !== "CHANGE_TO";
    });
  }

  function bindDelegatedNavigateReactions() {
    if (document.__figmaDelegatedNavigateBound) return;
    document.__figmaDelegatedNavigateBound = true;

    document.addEventListener("click", function (event) {
      if (!event.target || typeof event.target.closest !== "function") return;

      var current = event.target.closest("[data-fig-id]");
      while (current) {
        var sourceId = current.getAttribute("data-fig-id");
        var reaction = (model.reactions || []).find(function (candidate) {
          return (
            candidate.sourceId === sourceId &&
            candidate.trigger &&
            (candidate.trigger.type === "ON_CLICK" || candidate.trigger.type === "ON_PRESS") &&
            (!candidate.sourcePageId || candidate.sourcePageId === currentPageId) &&
            hasNavigateAction(candidate)
          );
        });

        if (reaction) {
          event.preventDefault();
          event.stopPropagation();
          var action = (reaction.actions || []).find(function (candidate) {
            return candidate && candidate.type === "NODE" && candidate.destinationId && candidate.navigation !== "CHANGE_TO";
          });
          if (action) {
            showPage(action.destinationId, action.transition);
          }
          return;
        }

        current = current.parentElement && typeof current.parentElement.closest === "function" ? current.parentElement.closest("[data-fig-id]") : null;
      }
    }, true);
  }

  refreshPages();
  getPages().forEach(function (page) {
    setPageVisible(page, page.getAttribute("data-fig-page") === currentPageId);
  });
  bindDelegatedNavigateReactions();
  bindAllReactions();
  if (!(model.reactions || []).length) {
    console.warn("[Figma interactions] No prototype reactions were exported. Check that the selected nodes contain prototype interactions.");
  } else if (diagnostics.bound === 0) {
    console.warn("[Figma interactions] Prototype reactions exist, but no DOM listeners were bound.", diagnostics);
  }
  initFigmaSwiperCarousels();
}
`.trim();

export const px2vwRatioScript = `
function updatePx2VwRatio() {
  const px2vwRatio = window.innerWidth / 1440;
  document.documentElement.style.setProperty('--px2vw-ratio', px2vwRatio);
}
`.trim();

export const px2vwRatioInitScript = `
updatePx2VwRatio();
window.addEventListener('resize', updatePx2VwRatio);
`.trim();

export const withPx2vwRatioScript = (script: string): string => {
  if (script.includes("function updatePx2VwRatio")) {
    return script;
  }

  return script.replace(
    "\n\nfunction initializeFigmaInteractions",
    `\n\n${px2vwRatioScript}\n\nfunction initializeFigmaInteractions`,
  );
};

export const renderInteractionInitScript = (
  options: { includePx2vwRatio?: boolean } = {},
): string =>
  [
    options.includePx2vwRatio ? px2vwRatioInitScript : "",
    "initializeFigmaInteractions(getFigmaInteractionModel());",
  ]
    .filter(Boolean)
    .join("\n\n");

export const renderInteractionScripts = (model: InteractionModel): string => {
  const serializedModel = escapeScriptJson(JSON.stringify(model, null, 2));

  return `<script type="application/json" id="figma-interaction-model">${serializedModel}</script>
<script>
${interactionRuntimeScript}
${renderInteractionInitScript()}
</script>`;
};
