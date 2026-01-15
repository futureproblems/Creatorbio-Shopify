/**
 * CreatorB Commerce V2 Controller
 * Handles view state management, cart, and product interactions
 */

(function() {
  'use strict';

  // ============================================
  // CONFIGURATION
  // ============================================

  const CONFIG = window.CB_CONFIG || {};
  const WORKER_URL = CONFIG.workerUrl || 'https://creatorbio-pricing.shopamorayou.workers.dev';
  const ANALYTICS_URL = CONFIG.analyticsUrl || 'https://creatorb.io/api';
  const CART_STORAGE_KEY = 'cb_cart_v2';

  // ============================================
  // MAIN CONTROLLER CLASS
  // ============================================

  class CreatorBCommerce {
    constructor() {
      this.page = document.querySelector('.cb-commerce-page');
      if (!this.page) return;

      this.currentView = 'browse';
      this.selectedProduct = null;
      this.selectedSize = null;
      this.cart = this.loadCart();
      this.creator = this.page.dataset.creator || CONFIG.creator || '';
      this.userId = this.page.dataset.userId || CONFIG.userId || '';

      this.init();
    }

    // ============================================
    // INITIALIZATION
    // ============================================

    init() {
      // Initialize session data (clears cart only on thank-you page after purchase)
      this.clearSessionData();

      this.bindEvents();
      this.updateCartCount();
      this.initCategoryFilters();
      this.initBottomTabs();
      this.initDotNav();
      this.initAccordions();
      this.initializeAnalytics();
      this.applyDynamicPricing();
      this.initShopSection();
      this.initLinksCarousel();
    }

    // Links carousel navigation
    initLinksCarousel() {
      const carousel = document.querySelector('.cb-links-carousel');
      if (!carousel) return;

      const prevBtn = document.querySelector('[data-links-nav="prev"]');
      const nextBtn = document.querySelector('[data-links-nav="next"]');
      const scrollAmount = 160;

      if (prevBtn) {
        prevBtn.addEventListener('click', () => {
          carousel.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
        });
      }

      if (nextBtn) {
        nextBtn.addEventListener('click', () => {
          carousel.scrollBy({ left: scrollAmount, behavior: 'smooth' });
        });
      }
    }

    clearSessionData() {
      // Check if we're on a thank you page (order completed)
      const isThankYouPage = window.location.pathname.includes('/thank_you') ||
                             window.location.pathname.includes('/orders/') ||
                             document.querySelector('.os-step__title');

      // Check if checkout was initiated (user went to Shopify checkout)
      const checkoutInitiated = sessionStorage.getItem('cb_checkout_initiated');

      if (isThankYouPage) {
        // Order completed - clear everything
        this.cart = [];
        localStorage.removeItem(CART_STORAGE_KEY);
        sessionStorage.removeItem('cb_checkout_initiated');
        console.log('Order completed - cart cleared');
      } else if (checkoutInitiated) {
        // User returned from Shopify checkout (failed/cancelled) - keep cart for retry
        this.cart = this.loadCart();
        // Clear the flag so next refresh will be fresh
        sessionStorage.removeItem('cb_checkout_initiated');
        console.log('Returned from checkout - cart preserved');
      } else {
        // Normal page load/refresh - fresh cart
        this.cart = [];
        localStorage.removeItem(CART_STORAGE_KEY);
        console.log('Fresh session - cart cleared');
      }

      // Clear customer info (don't persist sensitive data)
      this.customerInfo = null;

      // Clear pricing data to force re-fetch (dynamic pricing)
      sessionStorage.removeItem('pricing_delta');
      sessionStorage.removeItem('creator_products');
      sessionStorage.removeItem('creator_ref');
    }

    // ============================================
    // SHOP SECTION (Contained 390px)
    // ============================================

    initShopSection() {
      this.shopSection = this.page.querySelector('.cb-shop');
      if (!this.shopSection) return;

      this.shopView = 'grid';
      this.shopSelectedProduct = null;

      // Bind shop-specific events
      this.shopSection.addEventListener('click', (e) => {
        const action = e.target.closest('[data-action]');
        if (!action) return;

        const actionName = action.dataset.action;

        switch (actionName) {
          case 'shop-select-product':
            this.handleShopProductSelect(e);
            break;
          case 'shop-quick-add':
            e.stopPropagation();
            this.handleShopProductSelect(e);
            break;
          case 'shop-back-to-grid':
            this.setShopView('grid');
            break;
          case 'shop-back-to-product':
            this.setShopView('product');
            break;
          case 'shop-show-details':
            this.setShopView('details');
            break;
          case 'shop-show-cart':
            // If checkout form is open, go back to cart properly
            const checkoutForm = this.shopSection?.querySelector('.cb-shop__checkout-form');
            if (checkoutForm) {
              this.backToCart();
            } else {
              this.setShopView('cart');
            }
            break;
          case 'checkout-back-to-cart':
            this.backToCart();
            break;
          case 'express-checkout':
            e.preventDefault();
            e.stopPropagation();
            this.handleExpressCheckout(action.dataset.method);
            break;
          case 'checkout':
            console.log('Checkout button clicked');
            e.preventDefault();
            e.stopPropagation();
            this.handleShopCheckout();
            break;
        }
      });

      // Keyboard accessibility - Enter key on product cards
      this.shopSection.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          const product = e.target.closest('.cb-shop__product[data-action="shop-select-product"]');
          if (product && !product.classList.contains('cb-shop__product--sold-out')) {
            e.preventDefault();
            this.handleShopProductSelect({ target: product });
          }

          // Also handle size buttons with keyboard
          if (e.target.classList.contains('cb-shop__size-btn') && !e.target.classList.contains('sold-out')) {
            e.preventDefault();
            this.handleShopSizeSelect(e.target);
          }
        }
      });

      // Shop category tabs with filtering
      const categoryBtns = this.shopSection.querySelectorAll('.cb-shop__category');
      categoryBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          categoryBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.filterShopProducts(btn.dataset.category);
        });
      });

      // Shop size buttons
      this.shopSection.addEventListener('click', (e) => {
        if (e.target.classList.contains('cb-shop__size-btn') && !e.target.classList.contains('sold-out')) {
          this.handleShopSizeSelect(e.target);
        }
      });

      // Bottom tabs
      const bottomTabs = this.page.querySelectorAll('.cb-shop__bottom-tab');
      bottomTabs.forEach(tab => {
        tab.addEventListener('click', () => {
          bottomTabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          const tabName = tab.dataset.bottomTab;
          // Could show/hide tab content here
        });
      });

      // Update cart badge with any existing cart items from localStorage
      this.updateShopCartBadge();

      // Swipe to go back gesture
      this.initSwipeGestures();
    }

    initSwipeGestures() {
      if (!this.shopSection) return;

      let touchStartX = 0;
      let touchStartY = 0;
      let scrollableContainer = null;

      const minSwipeDistance = 80;
      const maxVerticalDistance = 100;
      const edgeThreshold = 30; // Only trigger from left edge

      this.shopSection.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;

        // Find if touch started inside a horizontally scrollable container
        scrollableContainer = e.target.closest('.cb-shop__carousel, .cb-shop__products, .cb-shop__categories');
      }, { passive: true });

      this.shopSection.addEventListener('touchend', (e) => {
        const touchEndX = e.changedTouches[0].screenX;
        const touchEndY = e.changedTouches[0].screenY;

        const deltaX = touchEndX - touchStartX;
        const deltaY = Math.abs(touchEndY - touchStartY);

        // Only process right swipes
        if (deltaX <= minSwipeDistance || deltaY >= maxVerticalDistance) {
          return;
        }

        // If started from left edge, always allow swipe back
        if (touchStartX < edgeThreshold) {
          this.handleSwipeBack();
          return;
        }

        // If inside a scrollable container, don't trigger swipe back
        if (scrollableContainer) {
          return;
        }

        // Otherwise allow swipe back
        this.handleSwipeBack();
      }, { passive: true });
    }

    handleSwipeBack() {
      // Only handle swipe back when not on grid view
      if (this.shopView === 'grid') return;

      // Check if checkout form is open
      const checkoutForm = this.shopSection?.querySelector('.cb-shop__checkout-form');
      if (checkoutForm) {
        this.backToCart();
        return;
      }

      // Navigate back based on current view
      switch (this.shopView) {
        case 'product':
          this.setShopView('grid');
          break;
        case 'details':
          this.setShopView('product');
          break;
        case 'cart':
          this.setShopView('grid');
          break;
      }
    }

    setShopView(view) {
      if (!this.shopSection) return;

      const previousView = this.shopView;
      this.shopView = view;
      this.shopSection.dataset.shopView = view;

      // Toggle details height
      if (view === 'details') {
        this.shopSection.classList.add('cb-shop--details-open');
      } else {
        this.shopSection.classList.remove('cb-shop--details-open');
      }

      // Hide all content sections with fade out
      this.shopSection.querySelectorAll('[data-shop-content]').forEach(el => {
        el.style.display = 'none';
        el.classList.remove('cb-shop--view-enter');
      });

      // Show the active content with fade in animation
      const activeContent = this.shopSection.querySelector(`[data-shop-content="${view}"]`);
      if (activeContent) {
        activeContent.style.display = view === 'grid' ? 'flex' : (view === 'cart' ? 'block' : 'flex');
        // Trigger animation
        requestAnimationFrame(() => {
          activeContent.classList.add('cb-shop--view-enter');
        });
      }

      // Scroll to center shop section when changing views
      if (previousView !== view) {
        this.shopSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      // Update header elements
      const headerGrid = this.shopSection.querySelector('[data-shop-header-grid]');
      const headerProduct = this.shopSection.querySelector('[data-shop-header-product]');
      const headerDetails = this.shopSection.querySelector('[data-shop-header-details]');
      const headerCart = this.shopSection.querySelector('[data-shop-header-cart]');
      const cartTitle = this.shopSection.querySelector('[data-shop-cart-title]');
      const detailsLink = this.shopSection.querySelector('[data-action="shop-show-details"]');
      const categories = this.shopSection.querySelector('[data-shop-categories]');

      // Hide all headers first
      [headerGrid, headerProduct, headerDetails, headerCart].forEach(el => {
        if (el) el.style.display = 'none';
      });
      if (cartTitle) cartTitle.style.display = 'none';
      if (detailsLink) detailsLink.style.display = 'none';
      if (categories) categories.style.display = 'none';

      // Show appropriate header based on view
      switch (view) {
        case 'grid':
          if (headerGrid) headerGrid.style.display = 'block';
          if (categories) categories.style.display = 'flex';
          break;
        case 'product':
          if (headerProduct) headerProduct.style.display = 'block';
          if (detailsLink) detailsLink.style.display = 'block';
          break;
        case 'details':
          if (headerDetails) headerDetails.style.display = 'block';
          break;
        case 'cart':
          if (headerCart) headerCart.style.display = 'block';
          if (cartTitle) cartTitle.style.display = 'block';
          this.renderShopCart();
          break;
      }
    }

    handleShopProductSelect(e) {
      const productEl = e.target.closest('.cb-shop__product');
      if (!productEl) return;

      const dataScript = productEl.querySelector('.cb-shop__product-data');
      if (!dataScript) return;

      try {
        const productData = JSON.parse(dataScript.textContent);
        this.shopSelectedProduct = productData;

        // Render product view
        this.renderShopProductView();
        this.setShopView('product');

        // Track
        this.trackEvent('product_click', { product_id: productData.id });
      } catch (err) {
        console.error('Failed to parse product data:', err);
      }
    }

    renderShopProductView() {
      if (!this.shopSelectedProduct) return;

      const product = this.shopSelectedProduct;

      // Render carousel images
      const carousel = this.shopSection.querySelector('[data-shop-carousel]');
      const dotsContainer = this.shopSection.querySelector('[data-shop-carousel-dots]');

      if (carousel && product.images?.length > 0) {
        carousel.innerHTML = product.images.map((img, i) => `
          <div class="cb-shop__carousel-slide" data-slide-index="${i}">
            <img src="${img}" alt="${product.title}" loading="lazy" data-action="open-lightbox" data-img-src="${img}">
          </div>
        `).join('');

        // Add lightbox click handlers
        carousel.querySelectorAll('[data-action="open-lightbox"]').forEach(img => {
          img.addEventListener('click', () => this.openLightbox(img.dataset.imgSrc, product.title));
        });

        // Render dots
        if (dotsContainer && product.images.length > 1) {
          dotsContainer.innerHTML = product.images.map((_, i) => `
            <button class="cb-shop__carousel-dot ${i === 0 ? 'active' : ''}" data-dot-index="${i}"></button>
          `).join('');
          dotsContainer.style.display = 'flex';

          // Initialize carousel scroll tracking
          this.initShopCarousel(carousel, dotsContainer);
        } else if (dotsContainer) {
          dotsContainer.style.display = 'none';
        }
      }

      // Update title and price
      const titleEl = this.shopSection.querySelector('[data-shop-product-title]');
      const priceEl = this.shopSection.querySelector('[data-shop-product-price]');
      if (titleEl) titleEl.textContent = product.title;
      if (priceEl) priceEl.textContent = `$${product.price.toFixed(2)}`;

      // Render sizes
      const sizesContainer = this.shopSection.querySelector('[data-shop-sizes]');
      if (sizesContainer) {
        const variants = product.variants || [];
        const sizes = [...new Set(variants.map(v => v.option1).filter(Boolean))];

        if (sizes.length === 0) {
          sizesContainer.innerHTML = '<span style="font-size: 11px; color: #8B7D6B;">One size</span>';
          this.shopSelectedSize = 'One Size';
        } else {
          sizesContainer.innerHTML = sizes.map(size => {
            const variant = variants.find(v => v.option1 === size);
            const available = variant?.available !== false;
            return `<button class="cb-shop__size-btn${!available ? ' sold-out' : ''}" data-size="${size}" ${!available ? 'disabled' : ''}>${size}</button>`;
          }).join('');
          this.shopSelectedSize = null;
        }
      }

      // Update details view
      const descEl = this.shopSection.querySelector('[data-shop-description]');
      if (descEl) descEl.textContent = product.description || 'A beautiful premium product crafted with care and attention to detail.';
    }

    initShopCarousel(carousel, dotsContainer) {
      const slides = carousel.querySelectorAll('.cb-shop__carousel-slide');
      const dots = dotsContainer.querySelectorAll('.cb-shop__carousel-dot');

      // Handle scroll to update active dot
      let scrollTimeout;
      carousel.addEventListener('scroll', () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          const scrollLeft = carousel.scrollLeft;
          const slideWidth = slides[0]?.offsetWidth + 12; // width + gap
          const activeIndex = Math.round(scrollLeft / slideWidth);

          dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === activeIndex);
          });
        }, 50);
      });

      // Dot click navigation
      dots.forEach((dot, i) => {
        dot.addEventListener('click', () => {
          const slideWidth = slides[0]?.offsetWidth + 12;
          carousel.scrollTo({ left: i * slideWidth, behavior: 'smooth' });
        });
      });
    }

    handleShopSizeSelect(btn) {
      const size = btn.dataset.size;

      // Add to cart immediately when size selected
      if (this.shopSelectedProduct && size) {
        const product = this.shopSelectedProduct;
        const variant = product.variants?.find(v => v.option1 === size) || product.variants?.[0];

        const cartItem = {
          id: product.id,
          variantId: variant?.id || product.id,
          handle: product.handle,
          title: product.title,
          price: product.price,
          size: size,
          image: product.images?.[0] || '',
          quantity: 1,
          creator: this.creator,
        };

        // Check if item already exists
        const existingIndex = this.cart.findIndex(
          item => item.variantId === cartItem.variantId && item.size === cartItem.size
        );

        if (existingIndex > -1) {
          this.cart[existingIndex].quantity += 1;
        } else {
          this.cart.push(cartItem);
        }

        this.saveCart();
        this.updateShopCartBadge();

        // Brief pulse animation
        btn.classList.add('added');
        setTimeout(() => btn.classList.remove('added'), 400);

        // Track
        this.trackEvent('add_to_cart', {
          product_id: product.id,
          variant_id: cartItem.variantId,
          size: size,
          price: product.price,
        });
      }
    }

    updateShopCartBadge() {
      const countEl = this.shopSection?.querySelector('[data-shop-cart-count]');
      if (countEl) {
        const count = this.cart.reduce((sum, item) => sum + item.quantity, 0);
        countEl.textContent = count > 0 ? (count > 99 ? '99' : count) : '';
      }
    }

    openLightbox(imgSrc, alt) {
      // Remove existing lightbox
      const existing = document.querySelector('.cb-lightbox');
      if (existing) existing.remove();

      const lightbox = document.createElement('div');
      lightbox.className = 'cb-lightbox';
      lightbox.innerHTML = `
        <div class="cb-lightbox__backdrop" data-action="close-lightbox"></div>
        <div class="cb-lightbox__content">
          <button class="cb-lightbox__close" data-action="close-lightbox" aria-label="Close">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
          <img src="${imgSrc}" alt="${alt || 'Product image'}">
        </div>
      `;

      document.body.appendChild(lightbox);

      // Animate in
      requestAnimationFrame(() => {
        lightbox.classList.add('visible');
      });

      // Close handlers
      lightbox.querySelectorAll('[data-action="close-lightbox"]').forEach(el => {
        el.addEventListener('click', () => this.closeLightbox());
      });

      // Close on escape
      const escHandler = (e) => {
        if (e.key === 'Escape') {
          this.closeLightbox();
          document.removeEventListener('keydown', escHandler);
        }
      };
      document.addEventListener('keydown', escHandler);
    }

    closeLightbox() {
      const lightbox = document.querySelector('.cb-lightbox');
      if (lightbox) {
        lightbox.classList.remove('visible');
        setTimeout(() => lightbox.remove(), 300);
      }
    }

    filterShopProducts(category) {
      if (!this.shopSection) return;

      const products = this.shopSection.querySelectorAll('.cb-shop__product');
      let visibleCount = 0;

      products.forEach(product => {
        const productCategory = product.querySelector('.cb-shop__product-data');
        let productData = null;

        try {
          productData = productCategory ? JSON.parse(productCategory.textContent) : null;
        } catch (e) {}

        // Get category from data attribute or product type
        const productCat = product.dataset.category;

        if (category === 'all' || productCat === category) {
          product.style.display = '';
          visibleCount++;
        } else {
          product.style.display = 'none';
        }
      });

      // Show/hide empty state
      this.toggleShopEmptyState(visibleCount === 0, category);
    }

    toggleShopEmptyState(isEmpty, category) {
      const productsContainer = this.shopSection?.querySelector('[data-shop-content="grid"]');
      if (!productsContainer) return;

      // Remove existing empty state
      const existingEmpty = productsContainer.querySelector('.cb-shop__empty-state');
      if (existingEmpty) existingEmpty.remove();

      if (isEmpty) {
        const emptyState = document.createElement('div');
        emptyState.className = 'cb-shop__empty-state';
        emptyState.innerHTML = `
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <p>No products found${category !== 'all' ? ` in "${category}"` : ''}</p>
          <button class="cb-shop__empty-btn" data-action="shop-clear-filter">View All Products</button>
        `;
        productsContainer.appendChild(emptyState);

        // Bind clear filter button
        emptyState.querySelector('[data-action="shop-clear-filter"]')?.addEventListener('click', () => {
          const allBtn = this.shopSection.querySelector('.cb-shop__category[data-category="all"]');
          if (allBtn) allBtn.click();
        });
      }
    }

    renderShopCart() {
      const itemsContainer = this.shopSection?.querySelector('[data-shop-cart-items]');
      const emptyMsg = this.shopSection?.querySelector('[data-shop-cart-empty]');
      const checkoutSection = this.shopSection?.querySelector('[data-shop-checkout]');
      const cartTotal = this.shopSection?.querySelector('[data-shop-cart-total]');

      if (!itemsContainer) return;

      if (this.cart.length === 0) {
        itemsContainer.innerHTML = '';
        if (emptyMsg) emptyMsg.style.display = 'block';
        if (checkoutSection) checkoutSection.style.display = 'none';
        return;
      }

      if (emptyMsg) emptyMsg.style.display = 'none';
      if (checkoutSection) checkoutSection.style.display = 'block';

      // Calculate and display total
      const total = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      if (cartTotal) cartTotal.textContent = `$${total.toFixed(2)}`;

      itemsContainer.innerHTML = this.cart.map((item, index) => `
        <div class="cb-shop__cart-item" data-cart-index="${index}">
          <div class="cb-shop__cart-item-image">
            ${item.image ? `<img src="${item.image}" alt="${item.title}">` : ''}
          </div>
          <div class="cb-shop__cart-item-info">
            <p class="name">${item.title}</p>
            <p class="price">$${(item.price * item.quantity).toFixed(2)}</p>
            <p class="meta">Size: ${item.size}</p>
          </div>
          <div class="cb-shop__cart-qty">
            <button class="cb-shop__cart-qty-btn" data-qty-action="decrease" data-index="${index}">−</button>
            <span class="cb-shop__cart-qty-value">${item.quantity}</span>
            <button class="cb-shop__cart-qty-btn" data-qty-action="increase" data-index="${index}">+</button>
          </div>
        </div>
      `).join('');

      // Bind quantity buttons
      itemsContainer.querySelectorAll('[data-qty-action]').forEach(btn => {
        btn.addEventListener('click', () => {
          const index = parseInt(btn.dataset.index, 10);
          const action = btn.dataset.qtyAction;

          if (action === 'increase') {
            this.cart[index].quantity += 1;
          } else if (action === 'decrease') {
            this.cart[index].quantity -= 1;
            if (this.cart[index].quantity <= 0) {
              this.cart.splice(index, 1);
            }
          }

          this.saveCart();
          this.updateShopCartBadge();

          // If cart is now empty, go back to grid view
          if (this.cart.length === 0) {
            this.setShopView('grid');
          } else {
            this.renderShopCart();
          }
        });
      });
    }

    backToCart() {
      const cartView = this.shopSection?.querySelector('[data-shop-content="cart"]');

      // Reset the cart header
      const cartTitle = this.shopSection?.querySelector('[data-shop-cart-title]');
      const headerCart = this.shopSection?.querySelector('[data-shop-header-cart]');

      if (cartTitle) cartTitle.textContent = 'CART';
      if (headerCart) headerCart.dataset.action = 'shop-back-to-grid';

      // Remove the checkout form
      const checkoutForm = cartView?.querySelector('.cb-shop__checkout-form');
      if (checkoutForm) checkoutForm.remove();

      // Show the original cart content
      if (cartView) {
        const hiddenContent = cartView.querySelectorAll(':scope > *');
        hiddenContent.forEach(el => {
          // Show cart items and checkout section appropriately
          if (el.hasAttribute('data-shop-cart-empty')) {
            el.style.display = this.cart.length === 0 ? 'block' : 'none';
          } else if (el.hasAttribute('data-shop-cart-items')) {
            el.style.display = 'block';
          } else if (el.hasAttribute('data-shop-checkout')) {
            el.style.display = this.cart.length > 0 ? 'block' : 'none';
          } else {
            el.style.display = '';
          }
        });
      }
    }

    // ============================================
    // CHECKOUT WITH AUTOFILL FORM
    // ============================================

    async handleExpressCheckout(method) {
      if (this.cart.length === 0) return;

      this.trackEvent('begin_checkout', {
        method: method,
        items: this.cart.length,
        total: this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
      });

      // Express pay only needs name and email (Apple Pay, Google Pay, Shop Pay have address stored)
      this.showCheckoutForm(true, method);
    }

    handleShopCheckout() {
      console.log('handleShopCheckout called, cart:', this.cart);
      if (this.cart.length === 0) {
        console.log('Cart is empty, returning');
        return;
      }
      console.log('Showing checkout form');
      this.showCheckoutForm(false);
    }

    showCheckoutForm(isExpress = false, expressMethod = null) {
      const cartView = this.shopSection?.querySelector('[data-shop-content="cart"]');
      if (!cartView) return;

      const total = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

      // Update the cart header to show checkout title
      const cartTitle = this.shopSection?.querySelector('[data-shop-cart-title]');
      const headerCart = this.shopSection?.querySelector('[data-shop-header-cart]');

      if (isExpress) {
        const methodLabels = {
          'apple': 'Apple Pay',
          'google': 'Google Pay',
          'shop': 'Shop Pay'
        };
        const methodLabel = methodLabels[expressMethod] || 'Express Pay';
        if (cartTitle) cartTitle.textContent = methodLabel;
      } else {
        if (cartTitle) cartTitle.textContent = 'CHECKOUT';
      }

      // Update back button to go back to cart
      if (headerCart) {
        headerCart.dataset.action = 'checkout-back-to-cart';
      }

      // Hide existing cart content (don't destroy it)
      const existingContent = cartView.querySelectorAll(':scope > *');
      existingContent.forEach(el => el.style.display = 'none');

      // Remove any existing checkout form
      const existingForm = cartView.querySelector('.cb-shop__checkout-form');
      if (existingForm) existingForm.remove();

      // Create checkout form element
      const formContainer = document.createElement('div');
      formContainer.className = isExpress ? 'cb-shop__checkout-form cb-shop__checkout-form--express' : 'cb-shop__checkout-form';

      // Express checkout form (simpler - just name and email)
      if (isExpress) {
        const methodLabels = {
          'apple': 'Apple Pay',
          'google': 'Google Pay',
          'shop': 'Shop Pay'
        };
        const methodLabel = methodLabels[expressMethod] || 'Express Pay';

        formContainer.innerHTML = `
          <button type="button" class="cb-shop__form-back" data-action="checkout-back-to-cart">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back to cart
          </button>
          <p class="cb-shop__form-note">Enter your details to continue with ${methodLabel}</p>

          <form class="cb-shop__form" data-checkout-form data-express="true" data-method="${expressMethod}">
            <div class="cb-shop__form-section">
              <div class="cb-shop__form-row">
                <input type="text" name="firstName" required placeholder="First name">
                <input type="text" name="lastName" required placeholder="Last name">
              </div>
              <input type="email" name="email" required placeholder="Email">
            </div>

            <div class="cb-shop__form-total">
              <span>Total</span>
              <span>$${total.toFixed(2)}</span>
            </div>

            <button type="submit" class="cb-shop__form-submit cb-shop__form-submit--${expressMethod}">
              Continue with ${methodLabel}
            </button>
          </form>
        `;
      } else {
        // Full checkout form
        formContainer.innerHTML = `
          <button type="button" class="cb-shop__form-back" data-action="checkout-back-to-cart">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back to cart
          </button>

          <form class="cb-shop__form" data-checkout-form>
            <div class="cb-shop__form-section">
              <label>Contact</label>
              <input type="email" name="email" required placeholder="Email">
            </div>

            <div class="cb-shop__form-section">
              <label>Shipping</label>
              <div class="cb-shop__form-row">
                <input type="text" name="firstName" required placeholder="First name">
                <input type="text" name="lastName" required placeholder="Last name">
              </div>
              <input type="text" name="address1" required placeholder="Address">
              <input type="text" name="address2" placeholder="Apt, suite, etc. (optional)">
              <div class="cb-shop__form-row">
                <input type="text" name="city" required placeholder="City">
                <input type="text" name="zip" required placeholder="ZIP code">
              </div>
              <select name="country" required>
                <option value="US" selected>United States</option>
                <option value="CA">Canada</option>
                <option value="GB">United Kingdom</option>
                <option value="AU">Australia</option>
              </select>
            </div>

            <div class="cb-shop__form-total">
              <span>Total</span>
              <span>$${total.toFixed(2)}</span>
            </div>

            <button type="submit" class="cb-shop__form-submit">
              Continue to Payment
            </button>
          </form>
        `;
      }

      // Add form to cart view
      cartView.appendChild(formContainer);

      // Handle form submit
      cartView.querySelector('[data-checkout-form]')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const form = e.target;
        const submitBtn = form.querySelector('.cb-shop__form-submit');
        const formData = new FormData(form);
        const isExpressForm = form.dataset.express === 'true';

        // Validate email
        const email = formData.get('email');
        const emailInput = form.querySelector('input[name="email"]');

        if (!this.isValidEmail(email)) {
          this.showFormError(emailInput, 'Please enter a valid email address');
          return;
        }

        // Validate required fields
        const firstName = formData.get('firstName');
        const lastName = formData.get('lastName');

        if (!firstName || firstName.trim() === '') {
          const input = form.querySelector('input[name="firstName"]');
          this.showFormError(input, 'First name is required');
          return;
        }

        if (!lastName || lastName.trim() === '') {
          const input = form.querySelector('input[name="lastName"]');
          this.showFormError(input, 'Last name is required');
          return;
        }

        // For full checkout, validate address fields
        if (!isExpressForm) {
          const address1 = formData.get('address1');
          const city = formData.get('city');
          const zip = formData.get('zip');

          if (!address1 || address1.trim() === '') {
            const input = form.querySelector('input[name="address1"]');
            this.showFormError(input, 'Address is required');
            return;
          }

          if (!city || city.trim() === '') {
            const input = form.querySelector('input[name="city"]');
            this.showFormError(input, 'City is required');
            return;
          }

          if (!zip || zip.trim() === '') {
            const input = form.querySelector('input[name="zip"]');
            this.showFormError(input, 'ZIP code is required');
            return;
          }
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="cb-shop__spinner"></span>';

        // Store customer info for checkout URL
        this.customerInfo = {
          email: email,
          firstName: firstName,
          lastName: lastName,
        };

        // Only add full address for regular checkout
        if (!isExpressForm) {
          this.customerInfo.address1 = formData.get('address1');
          this.customerInfo.address2 = formData.get('address2');
          this.customerInfo.city = formData.get('city');
          this.customerInfo.zip = formData.get('zip');
          this.customerInfo.country = formData.get('country');
        }

        // Open checkout (popup for express pay, modal for regular)
        await this.syncCartAndOpenCheckout(isExpressForm);
      });
    }

    isValidEmail(email) {
      if (!email) return false;
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email.trim());
    }

    showFormError(input, message) {
      // Remove any existing error
      this.clearFormErrors();

      // Add error class to input
      input.classList.add('cb-shop__input-error');

      // Create error message
      const errorEl = document.createElement('span');
      errorEl.className = 'cb-shop__form-error';
      errorEl.textContent = message;

      // Insert after input
      input.parentNode.insertBefore(errorEl, input.nextSibling);

      // Focus the input
      input.focus();

      // Remove error on input change
      input.addEventListener('input', () => {
        input.classList.remove('cb-shop__input-error');
        errorEl.remove();
      }, { once: true });
    }

    clearFormErrors() {
      const errors = document.querySelectorAll('.cb-shop__form-error');
      errors.forEach(el => el.remove());

      const errorInputs = document.querySelectorAll('.cb-shop__input-error');
      errorInputs.forEach(el => el.classList.remove('cb-shop__input-error'));
    }

    async syncCartAndOpenCheckout(usePopup = false) {
      try {
        // Validate cart has items
        if (this.cart.length === 0) {
          console.log('Cart is empty');
          return;
        }

        // Build direct checkout URL - bypasses cart entirely so theme can't intercept
        // Format: /cart/{variant_id}:{quantity},{variant_id}:{quantity}
        const lineItems = this.cart.map(item => `${item.variantId}:${item.quantity}`).join(',');

        if (!lineItems) {
          console.log('Unable to process cart items');
          return;
        }

        // Build customer info params
        const params = new URLSearchParams();
        if (this.customerInfo) {
          if (this.customerInfo.email) params.set('checkout[email]', this.customerInfo.email);
          if (this.customerInfo.firstName) params.set('checkout[shipping_address][first_name]', this.customerInfo.firstName);
          if (this.customerInfo.lastName) params.set('checkout[shipping_address][last_name]', this.customerInfo.lastName);
          if (this.customerInfo.address1) params.set('checkout[shipping_address][address1]', this.customerInfo.address1);
          if (this.customerInfo.address2) params.set('checkout[shipping_address][address2]', this.customerInfo.address2);
          if (this.customerInfo.city) params.set('checkout[shipping_address][city]', this.customerInfo.city);
          if (this.customerInfo.zip) params.set('checkout[shipping_address][zip]', this.customerInfo.zip);
          if (this.customerInfo.country) params.set('checkout[shipping_address][country]', this.customerInfo.country);
        }

        // Direct checkout URL - goes straight to checkout without touching cart API
        const checkoutUrl = `/cart/${lineItems}?${params.toString()}`;

        // Mark that checkout was initiated (cart will be cleared after successful purchase)
        // Keep cart in localStorage so if user backs out, they still have their items
        sessionStorage.setItem('cb_checkout_initiated', 'true');

        // Redirect to checkout
        window.location.href = checkoutUrl;
      } catch (error) {
        console.error('Checkout error:', error);
        console.error('Checkout failed');

        // Reset submit button
        const submitBtn = this.shopSection?.querySelector('.cb-shop__form-submit');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Continue to Payment';
        }
      }
    }

    // ============================================
    // EVENT BINDING
    // ============================================

    bindEvents() {
      // Delegate all clicks
      this.page.addEventListener('click', (e) => {
        const action = e.target.closest('[data-action]');
        if (!action) return;

        const actionName = action.dataset.action;
        e.preventDefault();

        switch (actionName) {
          case 'select-product':
            this.handleProductSelect(e);
            break;
          case 'quick-add':
            this.handleQuickAdd(e);
            break;
          case 'back-to-browse':
            this.showView('browse');
            break;
          case 'back-to-product':
            this.showView('product');
            break;
          case 'show-details':
            this.showView('details');
            break;
          case 'show-cart':
            this.showView('cart');
            break;
          case 'add-to-cart':
            this.handleAddToCart();
            break;
          case 'toggle-accordion':
            this.handleAccordionToggle(e);
            break;
          case 'update-quantity':
            this.handleQuantityUpdate(e);
            break;
          case 'checkout':
            this.handleCheckout();
            break;
          case 'show-mailing':
            this.showEmailModal();
            break;
          case 'close-modal':
            this.closeEmailModal();
            break;
        }
      });

      // Size button clicks
      this.page.addEventListener('click', (e) => {
        if (e.target.classList.contains('cb-size-btn') && !e.target.disabled) {
          this.handleSizeSelect(e.target.dataset.size);
        }
      });

      // Link click tracking
      this.page.querySelectorAll('.cb-link-card').forEach(link => {
        link.addEventListener('click', () => {
          const linkId = link.dataset.linkId;
          const linkUrl = link.href;
          this.trackEvent('link_click', { link_id: linkId, url: linkUrl });
        });
      });

      // Social icon tracking
      this.page.querySelectorAll('.cb-social-icon').forEach(icon => {
        icon.addEventListener('click', () => {
          this.trackEvent('social_click', { url: icon.href });
        });
      });

      // Email signup form
      const emailForm = document.getElementById('emailSignupForm');
      if (emailForm) {
        emailForm.addEventListener('submit', (e) => this.handleEmailSignup(e));
      }
    }

    // ============================================
    // VIEW MANAGEMENT
    // ============================================

    showView(viewName) {
      // Hide all views
      this.page.querySelectorAll('[data-view-content]').forEach(view => {
        view.style.display = 'none';
        view.classList.remove('cb-view--animate');
      });

      // Show target view
      const targetView = this.page.querySelector(`[data-view-content="${viewName}"]`);
      if (targetView) {
        targetView.style.display = 'block';
        // Trigger animation
        requestAnimationFrame(() => {
          targetView.classList.add('cb-view--animate');
        });
      }

      // Update page state
      this.page.dataset.view = viewName;
      this.currentView = viewName;

      // Scroll to top of content
      const contentArea = this.page.querySelector('.cb-content-area');
      if (contentArea) {
        contentArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      // Render cart if showing cart view
      if (viewName === 'cart') {
        this.renderCartView();
      }

      // Track view change
      this.trackEvent('view_change', { view: viewName });
    }

    // ============================================
    // PRODUCT SELECTION
    // ============================================

    handleProductSelect(e) {
      const card = e.target.closest('.cb-product-card');
      if (!card) return;

      // Get product data from embedded JSON
      const dataScript = card.querySelector('.cb-product-data');
      if (!dataScript) return;

      try {
        const productData = JSON.parse(dataScript.textContent);
        this.selectedProduct = productData;
        this.selectedSize = null;

        this.renderProductView();
        this.showView('product');

        // Track product click
        this.trackEvent('product_click', { product_id: productData.id });
      } catch (err) {
        console.error('Failed to parse product data:', err);
      }
    }

    handleQuickAdd(e) {
      e.stopPropagation();
      const card = e.target.closest('.cb-product-card');
      if (!card) return;

      // Get product data
      const dataScript = card.querySelector('.cb-product-data');
      if (!dataScript) return;

      try {
        const productData = JSON.parse(dataScript.textContent);
        this.selectedProduct = productData;
        this.selectedSize = null;

        this.renderProductView();
        this.showView('product');
      } catch (err) {
        console.error('Failed to parse product data:', err);
      }
    }

    renderProductView() {
      if (!this.selectedProduct) return;

      const product = this.selectedProduct;

      // Update title and price
      const titleEl = document.getElementById('productViewTitle');
      const priceEl = document.getElementById('productViewPrice');
      if (titleEl) titleEl.textContent = product.title;
      if (priceEl) priceEl.textContent = `$${product.price.toFixed(2)}`;

      // Render carousel
      const carousel = document.getElementById('productCarousel');
      if (carousel && product.images && product.images.length > 0) {
        carousel.innerHTML = product.images.map((img, i) => `
          <div class="cb-carousel-slide ${i === 0 ? 'active' : ''}" data-index="${i}">
            <img src="${img}" alt="${product.title}" loading="lazy">
          </div>
        `).join('');

        // Setup carousel interaction
        this.initCarousel(carousel);
      }

      // Render carousel dots
      const dotsContainer = document.getElementById('carouselDots');
      if (dotsContainer && product.images && product.images.length > 1) {
        dotsContainer.innerHTML = product.images.map((_, i) => `
          <button class="cb-carousel-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></button>
        `).join('');
      }

      // Render size selectors
      this.renderSizeSelector('sizeSelector');
      this.renderSizeSelector('detailsSizeSelector');

      // Update add to cart buttons
      this.updateAddToCartButton('addToCartBtn');
      this.updateAddToCartButton('detailsAddToCartBtn');

      // Update details view
      const detailsTitle = document.getElementById('detailsViewTitle');
      const detailsPrice = document.getElementById('detailsViewPrice');
      if (detailsTitle) detailsTitle.textContent = product.title;
      if (detailsPrice) detailsPrice.textContent = `$${product.price.toFixed(2)}`;

      // Update accordion content
      const descContent = document.getElementById('accordionDescription');
      if (descContent) {
        descContent.innerHTML = `<p>${product.description || 'No description available.'}</p>`;
      }
    }

    initCarousel(carousel) {
      const slides = carousel.querySelectorAll('.cb-carousel-slide');
      const dots = document.querySelectorAll('.cb-carousel-dot');

      // Handle scroll to update active state
      carousel.addEventListener('scroll', () => {
        const scrollLeft = carousel.scrollLeft;
        const slideWidth = slides[0]?.offsetWidth || 0;
        const gap = 12;
        const activeIndex = Math.round(scrollLeft / (slideWidth + gap));

        slides.forEach((slide, i) => {
          slide.classList.toggle('active', i === activeIndex);
        });
        dots.forEach((dot, i) => {
          dot.classList.toggle('active', i === activeIndex);
        });
      });

      // Dot clicks
      dots.forEach(dot => {
        dot.addEventListener('click', () => {
          const index = parseInt(dot.dataset.index, 10);
          const slideWidth = slides[0]?.offsetWidth || 0;
          const gap = 12;
          carousel.scrollTo({ left: index * (slideWidth + gap), behavior: 'smooth' });
        });
      });
    }

    renderSizeSelector(containerId) {
      const container = document.getElementById(containerId);
      if (!container || !this.selectedProduct) return;

      const variants = this.selectedProduct.variants || [];
      const sizes = [...new Set(variants.map(v => v.option1).filter(Boolean))];

      if (sizes.length === 0) {
        container.innerHTML = '<span style="font-size: 12px; color: var(--cb-text-muted);">One size</span>';
        // Auto-select if one size
        this.selectedSize = 'One Size';
        this.updateAddToCartButton('addToCartBtn');
        this.updateAddToCartButton('detailsAddToCartBtn');
        return;
      }

      container.innerHTML = sizes.map(size => {
        const variant = variants.find(v => v.option1 === size);
        const available = variant?.available !== false;
        return `
          <button
            class="cb-size-btn ${this.selectedSize === size ? 'selected' : ''}"
            data-size="${size}"
            ${!available ? 'disabled' : ''}
          >
            ${size}
          </button>
        `;
      }).join('');
    }

    handleSizeSelect(size) {
      this.selectedSize = size;

      // Update all size selectors
      this.page.querySelectorAll('.cb-size-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.size === size);
      });

      // Update add to cart buttons
      this.updateAddToCartButton('addToCartBtn');
      this.updateAddToCartButton('detailsAddToCartBtn');
    }

    updateAddToCartButton(buttonId) {
      const btn = document.getElementById(buttonId);
      if (!btn) return;

      if (this.selectedSize && this.selectedProduct) {
        btn.disabled = false;
        btn.textContent = `Add to Cart — $${this.selectedProduct.price.toFixed(2)}`;
      } else {
        btn.disabled = true;
        btn.textContent = 'Select a size';
      }
    }

    // ============================================
    // CART MANAGEMENT
    // ============================================

    loadCart() {
      try {
        // Use localStorage - cart persists across sessions
        return JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
      } catch {
        return [];
      }
    }

    saveCart() {
      // Use localStorage - cart persists across sessions
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(this.cart));
      this.updateCartCount();
    }

    updateCartCount() {
      const count = this.cart.reduce((sum, item) => sum + item.quantity, 0);
      const countEls = this.page.querySelectorAll('[data-cart-count]');

      countEls.forEach(el => {
        el.textContent = count;
        el.style.display = count > 0 ? 'flex' : 'none';
      });
    }

    handleAddToCart() {
      if (!this.selectedProduct || !this.selectedSize) return;

      const product = this.selectedProduct;
      const variant = product.variants?.find(v => v.option1 === this.selectedSize) || product.variants?.[0];

      const cartItem = {
        id: product.id,
        variantId: variant?.id || product.id,
        handle: product.handle,
        title: product.title,
        price: product.price,
        size: this.selectedSize,
        image: product.images?.[0] || '',
        quantity: 1,
        creator: this.creator,
      };

      // Check if item already exists
      const existingIndex = this.cart.findIndex(
        item => item.variantId === cartItem.variantId && item.size === cartItem.size
      );

      if (existingIndex > -1) {
        this.cart[existingIndex].quantity += 1;
      } else {
        this.cart.push(cartItem);
      }

      this.saveCart();
      this.showView('cart');

      // Track add to cart
      this.trackEvent('add_to_cart', {
        product_id: product.id,
        variant_id: cartItem.variantId,
        size: this.selectedSize,
        price: product.price,
      });
    }

    handleQuantityUpdate(e) {
      const btn = e.target.closest('[data-action="update-quantity"]');
      if (!btn) return;

      const cartItem = btn.closest('[data-cart-item]');
      if (!cartItem) return;

      const index = parseInt(cartItem.dataset.index, 10);
      const delta = parseInt(btn.dataset.delta, 10);

      if (this.cart[index]) {
        this.cart[index].quantity = Math.max(0, this.cart[index].quantity + delta);

        if (this.cart[index].quantity === 0) {
          this.cart.splice(index, 1);
        }

        this.saveCart();
        this.renderCartView();
      }
    }

    renderCartView() {
      const container = document.getElementById('cartItems');
      const checkoutBtn = document.getElementById('checkoutBtn');
      const summaryEl = document.getElementById('cartSummary');
      const subtotalEl = document.getElementById('cartSubtotal');

      if (!container) return;

      if (this.cart.length === 0) {
        container.innerHTML = `
          <div class="cb-cart__empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
              <path d="M6 6h15l-1.5 9h-12z"/>
              <circle cx="9" cy="20" r="1"/>
              <circle cx="18" cy="20" r="1"/>
              <path d="M6 6L5 3H2"/>
            </svg>
            <p>Your cart is empty</p>
            <button class="cb-cart__browse-btn" data-action="back-to-browse">
              Continue Shopping
            </button>
          </div>
        `;
        if (checkoutBtn) {
          checkoutBtn.disabled = true;
          checkoutBtn.textContent = 'Checkout — $0.00';
        }
        if (summaryEl) summaryEl.style.display = 'none';
        return;
      }

      const total = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

      container.innerHTML = this.cart.map((item, index) => `
        <div class="cb-cart-item" data-cart-item data-index="${index}">
          <div class="cb-cart-item__image">
            <img src="${item.image}" alt="${item.title}">
          </div>
          <div class="cb-cart-item__info">
            <p class="cb-cart-item__title">${item.title}</p>
            <p class="cb-cart-item__price">$${item.price.toFixed(2)}</p>
            <p class="cb-cart-item__meta">
              ${item.creator} · Size ${item.size}
            </p>
          </div>
          <div class="cb-cart-item__quantity">
            <button class="cb-qty-btn" data-action="update-quantity" data-delta="-1" aria-label="Decrease">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14"/>
              </svg>
            </button>
            <span class="cb-qty-value">${item.quantity}</span>
            <button class="cb-qty-btn" data-action="update-quantity" data-delta="1" aria-label="Increase">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </button>
          </div>
        </div>
      `).join('');

      if (checkoutBtn) {
        checkoutBtn.disabled = false;
        checkoutBtn.textContent = `Checkout — $${total.toFixed(2)}`;
      }

      if (summaryEl) {
        summaryEl.style.display = 'block';
      }
      if (subtotalEl) {
        subtotalEl.textContent = `$${total.toFixed(2)}`;
      }
    }

    handleCheckout() {
      if (this.cart.length === 0) return;

      // Build Shopify checkout URL
      const lineItems = this.cart.map(item => `${item.variantId}:${item.quantity}`).join(',');
      const checkoutUrl = `/cart/${lineItems}?ref=${this.creator}`;

      // Track checkout
      this.trackEvent('begin_checkout', {
        items: this.cart.length,
        total: this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
      });

      // Redirect to checkout
      window.location.href = checkoutUrl;
    }

    // ============================================
    // CATEGORY FILTERING
    // ============================================

    initCategoryFilters() {
      const tabs = this.page.querySelectorAll('.cb-category-tab');

      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          // Update active state
          tabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');

          // Filter products
          const category = tab.dataset.category;
          this.filterProducts(category);
        });
      });
    }

    filterProducts(category) {
      const cards = this.page.querySelectorAll('.cb-product-card');

      cards.forEach(card => {
        if (category === 'all' || card.dataset.category === category) {
          card.style.display = 'block';
        } else {
          card.style.display = 'none';
        }
      });
    }

    // ============================================
    // BOTTOM TABS
    // ============================================

    initBottomTabs() {
      const tabs = this.page.querySelectorAll('.cb-bottom-tab');
      const tabsContainer = this.page.querySelector('.cb-bottom-tabs');

      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          // Update active state
          tabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');

          // Show corresponding content
          const tabName = tab.dataset.tab;
          this.page.querySelectorAll('[data-tab-content]').forEach(content => {
            content.style.display = content.dataset.tabContent === tabName ? 'block' : 'none';
          });

          // Scroll so tabs are at the top of viewport
          if (tabsContainer) {
            tabsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
      });
    }

    // ============================================
    // SECTION NAV PILL & ANCHOR TABS
    // ============================================

    initDotNav() {
      const sectionNav = document.querySelector('.cb-section-nav');
      const anchorTabs = document.querySelectorAll('.cb-anchor-tab');

      // Move section nav to body to escape any transform containers
      if (sectionNav && sectionNav.parentElement !== document.body) {
        document.body.appendChild(sectionNav);
      }

      const tab = sectionNav ? sectionNav.querySelector('.cb-section-nav__tab') : null;
      const menuItems = sectionNav ? sectionNav.querySelectorAll('.cb-section-nav__item') : [];

      // Get all sections by ID directly (more reliable)
      const sectionIds = ['shop', 'section-socials', 'section-links', 'section-videos', 'section-music'];
      const sections = sectionIds
        .map(id => document.getElementById(id))
        .filter(el => el !== null);

      // Show/hide section nav on scroll
      if (sectionNav) {
        const showThreshold = 400; // pixels to scroll before showing
        let ticking = false;

        const updateNavVisibility = () => {
          if (window.scrollY > showThreshold) {
            sectionNav.classList.add('visible');
          } else {
            sectionNav.classList.remove('visible');
            sectionNav.classList.remove('expanded'); // Close menu when hidden
          }
          ticking = false;
        };

        window.addEventListener('scroll', () => {
          if (!ticking) {
            requestAnimationFrame(updateNavVisibility);
            ticking = true;
          }
        });
      }

      // Toggle menu on tab click
      if (tab) {
        tab.addEventListener('click', (e) => {
          e.stopPropagation();
          const isExpanded = sectionNav.classList.toggle('expanded');
          tab.setAttribute('aria-expanded', isExpanded);
        });
      }

      // Close menu when clicking outside
      document.addEventListener('click', (e) => {
        if (sectionNav && !sectionNav.contains(e.target)) {
          sectionNav.classList.remove('expanded');
          if (tab) tab.setAttribute('aria-expanded', 'false');
        }
      });

      // Menu item clicks - scroll to section
      menuItems.forEach(item => {
        item.addEventListener('click', () => {
          const targetId = item.dataset.scrollTo;
          const target = document.getElementById(targetId);
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          // Close menu after selection
          sectionNav.classList.remove('expanded');
          if (tab) tab.setAttribute('aria-expanded', 'false');
        });
      });

      // Click to scroll - Anchor Tabs
      anchorTabs.forEach(tab => {
        tab.addEventListener('click', () => {
          const targetId = tab.dataset.anchor;
          const target = document.getElementById(targetId);
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
      });

      // Scroll spy - update active section
      const updateActiveSection = () => {
        const viewportMiddle = window.innerHeight / 3;
        let activeId = 'shop';

        // Find which section is in view
        for (let i = sections.length - 1; i >= 0; i--) {
          const section = sections[i];
          const rect = section.getBoundingClientRect();

          if (rect.top <= viewportMiddle) {
            activeId = section.id;
            break;
          }
        }

        // Update menu items
        menuItems.forEach(item => {
          const isActive = item.dataset.scrollTo === activeId;
          item.classList.toggle('active', isActive);
        });

        // Update anchor tabs
        anchorTabs.forEach(anchorTab => {
          const isActive = anchorTab.dataset.anchor === activeId;
          anchorTab.classList.toggle('active', isActive);
        });
      };

      // Throttled scroll handler
      let scrollTicking = false;
      window.addEventListener('scroll', () => {
        if (!scrollTicking) {
          requestAnimationFrame(() => {
            updateActiveSection();
            scrollTicking = false;
          });
          scrollTicking = true;
        }
      });

      // Initial update
      updateActiveSection();
    }

    // ============================================
    // ACCORDIONS
    // ============================================

    initAccordions() {
      // Accordions are already handled by the toggle-accordion action
    }

    handleAccordionToggle(e) {
      const accordion = e.target.closest('.cb-accordion');
      if (!accordion) return;

      const isOpen = accordion.classList.contains('open');

      // Close all accordions in the same group
      accordion.parentElement.querySelectorAll('.cb-accordion').forEach(acc => {
        acc.classList.remove('open');
      });

      // Toggle clicked accordion
      if (!isOpen) {
        accordion.classList.add('open');
      }
    }

    // ============================================
    // EMAIL MODAL
    // ============================================

    showEmailModal() {
      const modal = document.getElementById('emailModal');
      if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
      }
    }

    closeEmailModal() {
      const modal = document.getElementById('emailModal');
      if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
      }
    }

    async handleEmailSignup(e) {
      e.preventDefault();

      const emailInput = document.getElementById('emailInput');
      const submitBtn = document.getElementById('emailSubmitBtn');
      const message = document.getElementById('emailMessage');

      const email = emailInput?.value?.trim();
      if (!email) return;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Subscribing...';
      message.textContent = '';
      message.className = 'cb-email-message';

      try {
        const response = await fetch(`${ANALYTICS_URL}/email-signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, username: this.creator }),
        });

        const data = await response.json();

        if (response.ok) {
          message.textContent = data.message || 'Successfully subscribed!';
          message.classList.add('success');
          emailInput.value = '';
          this.trackEvent('email_signup', { email });

          // Close modal after delay
          setTimeout(() => this.closeEmailModal(), 2000);
        } else {
          message.textContent = data.error || 'Something went wrong. Please try again.';
          message.classList.add('error');
        }
      } catch (error) {
        message.textContent = 'Network error. Please try again.';
        message.classList.add('error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Subscribe';
      }
    }

    // ============================================
    // DYNAMIC PRICING
    // ============================================

    async applyDynamicPricing() {
      if (!this.creator) return;

      try {
        const [metricsData, productsData] = await Promise.all([
          fetch(`${WORKER_URL}/metrics/${this.creator}`).then(r => r.ok ? r.json() : { suggested_delta: 0 }),
          fetch(`${WORKER_URL}/creator-products/${this.creator}`).then(r => r.ok ? r.json() : { products: [] }),
        ]);

        const delta = parseFloat(metricsData.suggested_delta) / 100 || 0;
        const creatorProducts = productsData.products || [];

        // Store pricing delta for use in cart
        this.pricingDelta = delta;

        // Store in session
        sessionStorage.setItem('creator_ref', this.creator);
        sessionStorage.setItem('pricing_delta', delta.toString());
        sessionStorage.setItem('creator_products', JSON.stringify(creatorProducts));

        // Apply to visible product cards (browse view)
        const productCards = this.page.querySelectorAll('.cb-product-card');

        productCards.forEach(card => {
          const productId = card.dataset.productId;
          const variantId = card.dataset.variantId;
          const basePrice = parseFloat(card.dataset.basePrice);
          const priceElement = card.querySelector('.cb-product-card__price');
          const badge = card.querySelector('.cb-product-card__badge');

          if (!priceElement || !basePrice || isNaN(basePrice)) return;

          // Check if product has creator commission
          const hasCommission = creatorProducts.some(p =>
            p.product_id === productId || p.variant_id === variantId
          );

          // Apply pricing delta
          if (delta > 0) {
            const newPrice = basePrice * (1 + delta / 100);
            priceElement.textContent = `$${newPrice.toFixed(2)}`;
          }

          // Show badge if has commission
          if (hasCommission && badge) {
            badge.classList.add('show');
          }
        });

        // Apply to shop section products (horizontal scroll grid)
        const shopProducts = this.page.querySelectorAll('.cb-shop__product');

        shopProducts.forEach(product => {
          const productId = product.dataset.productId;
          const priceElement = product.querySelector('.cb-shop__product-price');
          const commissionBadge = product.querySelector('[data-commission-badge]');

          if (!priceElement) return;

          const basePrice = parseFloat(priceElement.dataset.basePrice);
          if (!basePrice || isNaN(basePrice)) return;

          // Check if product has creator commission
          const hasCommission = creatorProducts.some(p =>
            p.product_id === productId || String(p.product_id) === productId
          );

          // Apply pricing delta
          if (delta > 0) {
            const newPrice = basePrice * (1 + delta / 100);
            priceElement.textContent = `$${newPrice.toFixed(2)}`;
          }

          // Show commission badge if has commission
          if (hasCommission && commissionBadge) {
            commissionBadge.classList.add('show');
          }

          // Update embedded product data JSON
          const dataScript = product.querySelector('.cb-shop__product-data');
          if (dataScript) {
            try {
              const productData = JSON.parse(dataScript.textContent);
              productData.price = basePrice * (1 + delta / 100);
              // Update variant prices too
              if (productData.variants) {
                productData.variants.forEach(v => {
                  v.price = v.price * (1 + delta / 100);
                });
              }
              dataScript.textContent = JSON.stringify(productData);
            } catch (e) {
              // Ignore JSON parse errors
            }
          }
        });
      } catch (err) {
        console.log('Dynamic pricing failed:', err);
      }
    }

    // ============================================
    // ANALYTICS
    // ============================================

    initializeAnalytics() {
      // Track page view
      this.trackEvent('page_view');

      // Track to worker for dynamic pricing
      fetch(`${WORKER_URL}/track/${this.creator}/page`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => {});

      // Setup product view tracking with Intersection Observer
      this.setupProductViewTracking();
    }

    setupProductViewTracking() {
      const productCards = this.page.querySelectorAll('.cb-product-card');
      if (!productCards.length) return;

      const viewedProducts = new Set();

      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const productId = entry.target.dataset.productId;
            if (productId && !viewedProducts.has(productId)) {
              viewedProducts.add(productId);
              this.trackEvent('product_view', { product_id: productId });
            }
          }
        });
      }, { threshold: 0.5 });

      productCards.forEach(card => observer.observe(card));
    }

    trackEvent(eventType, metadata = {}) {
      // Skip if no userId (required for analytics)
      if (!this.userId) return;

      // Get or create session ID
      let sessionId = sessionStorage.getItem('cbio_session');
      if (!sessionId) {
        sessionId = 'cbv2_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        sessionStorage.setItem('cbio_session', sessionId);
      }

      // Detect device info
      const ua = navigator.userAgent;
      const deviceType = /Mobile|Android|iPhone|iPad|iPod/i.test(ua) ? 'mobile' : 'desktop';
      const browser = /Chrome/i.test(ua) ? 'Chrome' : /Firefox/i.test(ua) ? 'Firefox' : /Safari/i.test(ua) ? 'Safari' : 'Other';
      const os = /Win/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'MacOS' : /Linux/i.test(ua) ? 'Linux' : /Android/i.test(ua) ? 'Android' : /iOS/i.test(ua) ? 'iOS' : 'Other';

      const event = {
        event_type: eventType,
        creator_id: this.userId,
        session_id: sessionId,
        referrer: document.referrer || '',
        device_type: deviceType,
        browser: browser,
        os: os,
        metadata: {},
      };

      // Move special fields to top-level
      if (metadata.link_id) event.link_id = metadata.link_id;
      if (metadata.product_id) event.product_id = metadata.product_id;

      // Keep remaining metadata
      Object.keys(metadata).forEach(key => {
        if (key !== 'link_id' && key !== 'product_id') {
          event.metadata[key] = metadata[key];
        }
      });

      if (Object.keys(event.metadata).length === 0) {
        delete event.metadata;
      }

      fetch(`${ANALYTICS_URL}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: [event] }),
        keepalive: true,
      }).catch(() => {});
    }
  }

  // ============================================
  // INITIALIZE ON DOM READY
  // ============================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.cbCommerce = new CreatorBCommerce();
    });
  } else {
    window.cbCommerce = new CreatorBCommerce();
  }

})();
