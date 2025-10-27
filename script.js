// script.js
document.addEventListener('DOMContentLoaded', () => {

    const API_URL = ''; // Vercel handles the '/api' prefix automatically

    // --- DATA STRUCTURE: TRIE (PREFIX TREE) ---
    class TrieNode {
        constructor() {
            // Hash Map for children
            this.children = {};
            this.isEndOfWord = false;
        }
    }

    class Trie {
        constructor() {
            this.root = new TrieNode();
        }

        insert(word) {
            let currentNode = this.root;
            for (const char of word) {
                if (!currentNode.children[char]) {
                    currentNode.children[char] = new TrieNode();
                }
                currentNode = currentNode.children[char];
            }
            currentNode.isEndOfWord = true;
        }

        search(prefix) {
            let currentNode = this.root;
            for (const char of prefix) {
                if (!currentNode.children[char]) {
                    return []; // No suggestions
                }
                currentNode = currentNode.children[char];
            }
            return this._findAllWords(currentNode, prefix);
        }

        _findAllWords(node, prefix) {
            let suggestions = [];
            if (node.isEndOfWord) {
                suggestions.push(prefix);
            }

            for (const char in node.children) {
                suggestions = suggestions.concat(this._findAllWords(node.children[char], prefix + char));
            }
            return suggestions;
        }
    }

    const eventTrie = new Trie();

    // --- DOM ELEMENTS ---
    const listingsGrid = document.getElementById('listings-grid');
    const guestView = document.getElementById('guest-view');
    const userView = document.getElementById('user-view');
    const welcomeMessage = document.getElementById('welcome-message');

    // Modals
    const loginModal = document.getElementById('login-modal');
    const signupModal = document.getElementById('signup-modal');
    const sellPassModal = document.getElementById('sell-pass-modal');
    const myListingsModal = document.getElementById('my-listings-modal');
    const alertModal = document.getElementById('alert-modal');
    const paymentModal = document.getElementById('payment-modal');

    // Forms
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const sellPassForm = document.getElementById('sell-pass-form');

    // Buttons
    const loginBtn = document.getElementById('login-btn');
    const signupBtn = document.getElementById('signup-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const sellTicketsNavBtn = document.getElementById('sell-tickets-nav-btn');
    const buyTicketsNavBtn = document.getElementById('buy-tickets-nav-btn');
    const findPassesHeroBtn = document.getElementById('find-passes-hero-btn');
    const sellPassesHeroBtn = document.getElementById('sell-passes-hero-btn');
    const myListingsBtn = document.getElementById('my-listings-btn');
    const applyFiltersBtn = document.getElementById('apply-filters-btn');
    const resetFiltersBtn = document.getElementById('reset-filters-btn');

    // Search & Autocomplete
    const searchInput = document.getElementById('event-name-search');
    const suggestionsBox = document.getElementById('autocomplete-suggestions');


    // --- STATE MANAGEMENT ---
    let currentUser = null;

    function checkLoginStatus() {
        const user = localStorage.getItem('currentUser');
        if (user) {
            currentUser = JSON.parse(user);
            updateUIForLogin();
        } else {
            updateUIForLogout();
        }
    }

    function updateUIForLogin() {
        guestView.style.display = 'none';
        userView.style.display = 'flex';
        welcomeMessage.textContent = `Welcome, ${currentUser.username}!`;
    }

    function updateUIForLogout() {
        guestView.style.display = 'flex';
        userView.style.display = 'none';
        welcomeMessage.textContent = '';
        currentUser = null;
        localStorage.removeItem('currentUser');
    }

    // --- MODAL HANDLING ---
    function openModal(modal) { modal.style.display = 'block'; }
    function closeModal(modal) { modal.style.display = 'none'; }

    document.querySelectorAll('.modal .close-btn').forEach(btn => {
        btn.onclick = () => closeModal(btn.closest('.modal'));
    });
    
    document.getElementById('alert-ok-btn').onclick = () => closeModal(alertModal);

    window.onclick = (event) => {
        if (event.target.classList.contains('modal')) {
            closeModal(event.target);
        }
    };
    
    // --- UTILITY FUNCTIONS ---
    function showAlert(title, message) {
        document.getElementById('alert-title').textContent = title;
        document.getElementById('alert-message').textContent = message;
        openModal(alertModal);
    }
    
    function showPaymentSimulation(title, callback) {
        document.getElementById('payment-title').textContent = title;
        openModal(paymentModal);
        setTimeout(() => {
            closeModal(paymentModal);
            if(callback) callback();
        }, 2500); // Simulate 2.5 second payment processing
    }

    // --- API CALLS & RENDERING ---
    async function fetchListings() {
        const city = document.getElementById('city-filter').value;
        const passType = document.getElementById('pass-type-filter').value;
        const date = document.getElementById('date-filter').value;
        const eventName = searchInput.value;

        let query = new URLSearchParams();
        if (city) query.append('city', city);
        if (passType) query.append('passType', passType);
        if (date) query.append('date', date);
        if (eventName) query.append('eventName', eventName);

        try {
            const response = await fetch(`${API_URL}/api/listings?${query.toString()}`);
            const listings = await response.json();
            renderListings(listings);
        } catch (error) {
            console.error('Error fetching listings:', error);
            listingsGrid.innerHTML = '<p>Could not fetch listings. Please try again later.</p>';
        }
    }

    function renderListings(listings) {
        listingsGrid.innerHTML = '';
        if (listings.length === 0) {
            listingsGrid.innerHTML = '<p>No passes found matching your criteria.</p>';
            return;
        }
        listings.forEach(listing => {
            const card = document.createElement('div');
            card.className = 'listing-card' + (listing.isBoosted ? ' boosted' : '');
            
            const eventDate = new Date(listing.date).toLocaleDateString('en-US', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });

            card.innerHTML = `
                <div class="boost-banner">🚀 Boosted Listing</div>
                <div class="card-content">
                    <h3 class="card-title">${listing.eventName}</h3>
                    <div class="card-info">
                        <span><strong>City:</strong> ${listing.city}</span>
                        <span><strong>Type:</strong> ${listing.passType}</span>
                        <span><strong>Date:</strong> ${eventDate}</span>
                        <span><strong>Seller:</strong> ${listing.seller.username}</span>
                    </div>
                    <div class="card-footer">
                        <span class="price">$${listing.price}</span>
                        <button class="card-btn buy-btn" data-id="${listing._id}">View Contact ($10)</button>
                    </div>
                </div>
            `;
            listingsGrid.appendChild(card);
        });
    }

    async function fetchEventNamesForTrie() {
        try {
            const response = await fetch(`${API_URL}/api/events`);
            const eventNames = await response.json();
            eventNames.forEach(name => eventTrie.insert(name.toLowerCase()));
        } catch (error) {
            console.error('Error fetching event names:', error);
        }
    }

    // --- EVENT LISTENERS ---

    // Auth
    loginBtn.onclick = () => openModal(loginModal);
    signupBtn.onclick = () => openModal(signupModal);
    logoutBtn.onclick = () => {
        updateUIForLogout();
        showAlert('Success', 'You have been logged out.');
    };

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        const errorEl = document.getElementById('login-error');
        errorEl.textContent = '';

        try {
            const response = await fetch(`${API_URL}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message);
            
            currentUser = { userId: data.userId, username: data.username };
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            updateUIForLogin();
            closeModal(loginModal);
            loginForm.reset();
        } catch (error) {
            errorEl.textContent = error.message || 'Login failed.';
        }
    });

    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('signup-username').value;
        const password = document.getElementById('signup-password').value;
        const phoneNumber = document.getElementById('signup-phone').value;
        const errorEl = document.getElementById('signup-error');
        errorEl.textContent = '';
        
        try {
            const response = await fetch(`${API_URL}/api/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, phoneNumber })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message);
            
            closeModal(signupModal);
            signupForm.reset();
            showAlert('Success!', 'Registration successful. Please log in.');
            openModal(loginModal);
        } catch (error) {
            errorEl.textContent = error.message || 'Registration failed.';
        }
    });

    // Main Actions
    const handleSellButtonClick = () => {
        if (currentUser) {
            openModal(sellPassModal);
        } else {
            showAlert('Login Required', 'You need to be logged in to sell a pass.');
            openModal(loginModal);
        }
    };
    sellTicketsNavBtn.onclick = handleSellButtonClick;
    sellPassesHeroBtn.onclick = handleSellButtonClick;

    const handleBuyButtonClick = () => {
        document.getElementById('listings-section').scrollIntoView({ behavior: 'smooth' });
    };
    buyTicketsNavBtn.onclick = handleBuyButtonClick;
    findPassesHeroBtn.onclick = handleBuyButtonClick;

    // Sell Pass Form
    sellPassForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const callback = async () => {
            const formData = {
                eventName: document.getElementById('event-name').value,
                city: document.getElementById('city').value,
                passType: document.getElementById('pass-type').value,
                price: document.getElementById('price').value,
                date: document.getElementById('date').value,
                sellerId: currentUser.userId,
                contactInfo: (await (await fetch(`${API_URL}/api/users/${currentUser.userId}`)).json()).phoneNumbers[0] // Simplified, assumes one phone number
            };

            // In a real app, you would get the seller's contact info securely
            const userResponse = await fetch(`${API_URL}/api/users/${currentUser.userId}`);
            const userData = await userResponse.json();
            formData.contactInfo = userData.phoneNumbers[0] || 'Not Available';

            try {
                const response = await fetch(`${API_URL}/api/listings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
                if (!response.ok) throw new Error('Failed to create listing.');
                
                closeModal(sellPassModal);
                sellPassForm.reset();
                showAlert('Success!', 'Your pass has been listed.');
                fetchListings(); // Refresh list
                fetchEventNamesForTrie(); // Refresh Trie
            } catch (error) {
                showAlert('Error', error.message);
            }
        };
        showPaymentSimulation('Processing $25 Listing Fee', callback);
    });

    // Buy Button on Cards
    listingsGrid.addEventListener('click', (e) => {
        if (e.target.classList.contains('buy-btn')) {
            if (!currentUser) {
                showAlert('Login Required', 'Please log in to purchase a pass.');
                openModal(loginModal);
                return;
            }
            
            const listingId = e.target.dataset.id;
            const callback = async () => {
                 try {
                    const response = await fetch(`${API_URL}/api/listings/${listingId}/purchase`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: currentUser.userId })
                    });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.message);
                    
                    showAlert('Purchase Complete!', `Seller's Contact: ${data.contactInfo}`);
                } catch (error) {
                    showAlert('Error', error.message);
                }
            };
            showPaymentSimulation('Processing $10 Viewing Fee', callback);
        }
    });

    // My Listings
    myListingsBtn.onclick = async () => {
        if (!currentUser) return;
        try {
            const response = await fetch(`${API_URL}/api/listings/my?userId=${currentUser.userId}`);
            const listings = await response.json();
            const content = document.getElementById('my-listings-content');
            content.innerHTML = '';
            
            if (listings.length === 0) {
                content.innerHTML = '<p>You have not listed any passes yet.</p>';
            } else {
                listings.forEach(listing => {
                    const item = document.createElement('div');
                    item.className = 'my-listing-item' + (listing.isSold ? ' sold' : '');
                    
                    const boostButtonHtml = listing.isBoosted 
                        ? `<button class="boosted-btn" disabled>Boosted</button>` 
                        : `<button class="boost-btn" data-id="${listing._id}">Boost ($10)</button>`;
                    
                    const soldButtonHtml = listing.isSold
                        ? `<span>SOLD</span>`
                        : `<button class="sold-btn" data-id="${listing._id}">Mark as Sold</button>`;

                    item.innerHTML = `
                        <div class="my-listing-info">
                            <h4>${listing.eventName}</h4>
                            <p>$${listing.price} - ${new Date(listing.date).toLocaleDateString()}</p>
                        </div>
                        <div class="my-listing-actions">
                            ${boostButtonHtml}
                            ${soldButtonHtml}
                        </div>
                    `;
                    content.appendChild(item);
                });
            }
            openModal(myListingsModal);
        } catch (error) {
            showAlert('Error', 'Could not fetch your listings.');
        }
    };

    document.getElementById('my-listings-content').addEventListener('click', (e) => {
        const listingId = e.target.dataset.id;
        if (!listingId) return;

        if (e.target.classList.contains('boost-btn')) {
            const callback = async () => {
                await fetch(`${API_URL}/api/listings/${listingId}/boost`, { method: 'POST' });
                showAlert('Success', 'Your listing has been boosted!');
                closeModal(myListingsModal);
                fetchListings(); // Refresh main view
            };
            showPaymentSimulation('Processing $10 Boost Fee', callback);
        } else if (e.target.classList.contains('sold-btn')) {
            const markAsSold = async () => {
                await fetch(`${API_URL}/api/listings/${listingId}/mark-sold`, { method: 'POST' });
                showAlert('Success', 'Your listing has been marked as sold.');
                closeModal(myListingsModal);
                fetchListings(); // Refresh main view
            };
            markAsSold();
        }
    });

    // Filters and Search
    applyFiltersBtn.onclick = fetchListings;
    resetFiltersBtn.onclick = () => {
        document.getElementById('city-filter').value = '';
        document.getElementById('pass-type-filter').value = '';
        document.getElementById('date-filter').value = '';
        searchInput.value = '';
        fetchListings();
    };

    searchInput.addEventListener('input', () => {
        const prefix = searchInput.value.toLowerCase();
        if (prefix.length < 2) {
            suggestionsBox.innerHTML = '';
            suggestionsBox.style.display = 'none';
            return;
        }
        const suggestions = eventTrie.search(prefix);
        suggestionsBox.innerHTML = '';
        if(suggestions.length > 0) {
            suggestions.forEach(suggestion => {
                const div = document.createElement('div');
                div.textContent = suggestion;
                div.onclick = () => {
                    searchInput.value = suggestion;
                    suggestionsBox.style.display = 'none';
                    fetchListings(); // apply search immediately
                };
                suggestionsBox.appendChild(div);
            });
            suggestionsBox.style.display = 'block';
        } else {
            suggestionsBox.style.display = 'none';
        }
    });
    
    // Hide suggestions when clicking outside
    document.addEventListener('click', function(event) {
        if (!searchInput.contains(event.target)) {
            suggestionsBox.style.display = 'none';
        }
    });

    // --- INITIALIZATION ---
    checkLoginStatus();
    fetchListings();
    fetchEventNamesForTrie();
});