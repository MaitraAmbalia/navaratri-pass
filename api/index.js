// api/index.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// --- DATABASE CONNECTION ---
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/navaratriPasses')
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));


// --- MONGOOSE SCHEMAS ---
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phoneNumbers: [String],
    listings: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Listing' }],
    purchaseHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Listing' }]
});

const ListingSchema = new mongoose.Schema({
    eventName: { type: String, required: true, trim: true },
    city: { type: String, required: true },
    passType: { type: String, enum: ['Single', 'Couple', 'Group'], required: true },
    price: { type: Number, required: true },
    date: { type: Date, required: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    contactInfo: { type: String, required: true },
    isBoosted: { type: Boolean, default: false },
    isSold: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Listing = mongoose.model('Listing', ListingSchema);

// --- DATA STRUCTURE: PRIORITY QUEUE (MAX-HEAP) ---
class PriorityQueue {
    constructor() {
        this.heap = [];
    }

    getParentIndex(i) { return Math.floor((i - 1) / 2); }
    getLeftChildIndex(i) { return 2 * i + 1; }
    getRightChildIndex(i) { return 2 * i + 2; }

    swap(i1, i2) {
        [this.heap[i1], this.heap[i2]] = [this.heap[i2], this.heap[i1]];
    }

    getPriority(item) {
        // Boosted items get priority 1, others get 0. Higher is better.
        // We add creation time to sort newer items first among same-priority items.
        const priority = item.isBoosted ? 1 : 0;
        return priority * 1e14 + new Date(item.createdAt).getTime(); // Combine priority and time
    }

    insert(item) {
        this.heap.push(item);
        let currentIndex = this.heap.length - 1;
        while (currentIndex > 0 && this.getPriority(this.heap[currentIndex]) > this.getPriority(this.heap[this.getParentIndex(currentIndex)])) {
            this.swap(currentIndex, this.getParentIndex(currentIndex));
            currentIndex = this.getParentIndex(currentIndex);
        }
    }

    extractMax() {
        if (this.heap.length === 0) return null;
        if (this.heap.length === 1) return this.heap.pop();

        const max = this.heap[0];
        this.heap[0] = this.heap.pop();
        let currentIndex = 0;

        while (this.getLeftChildIndex(currentIndex) < this.heap.length) {
            let biggestChildIndex = this.getLeftChildIndex(currentIndex);
            let rightChildIndex = this.getRightChildIndex(currentIndex);

            if (rightChildIndex < this.heap.length && this.getPriority(this.heap[rightChildIndex]) > this.getPriority(this.heap[biggestChildIndex])) {
                biggestChildIndex = rightChildIndex;
            }

            if (this.getPriority(this.heap[currentIndex]) > this.getPriority(this.heap[biggestChildIndex])) {
                break;
            } else {
                this.swap(currentIndex, biggestChildIndex);
                currentIndex = biggestChildIndex;
            }
        }
        return max;
    }
    
    isEmpty() {
        return this.heap.length === 0;
    }
}


// --- API ROUTES ---

// User Registration
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, phoneNumber } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword, phoneNumbers: [phoneNumber] });
        await newUser.save();
        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error registering user', error });
    }
});

// User Login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        // In a real app, you'd return a JWT token here.
        // For this project, we'll return a simple object.
        res.status(200).json({ message: 'Login successful', userId: user._id, username: user.username });
    } catch (error) {
        res.status(500).json({ message: 'Error logging in', error });
    }
});

// Create a new Listing
app.post('/api/listings', async (req, res) => {
    try {
        const { eventName, city, passType, price, date, sellerId, contactInfo } = req.body;
        const newListing = new Listing({
            eventName, city, passType, price, date, seller: sellerId, contactInfo
        });
        await newListing.save();
        await User.findByIdAndUpdate(sellerId, { $push: { listings: newListing._id } });
        res.status(201).json(newListing);
    } catch (error) {
        res.status(500).json({ message: 'Error creating listing', error });
    }
});

// Get all available listings with filtering and sorting
app.get('/api/listings', async (req, res) => {
    try {
        // Hash Table is used here implicitly to build the filter query object
        const filters = {};
        if (req.query.city) filters.city = req.query.city;
        if (req.query.passType) filters.passType = req.query.passType;
        if (req.query.date) {
            const searchDate = new Date(req.query.date);
            filters.date = {
                $gte: new Date(searchDate.setHours(0, 0, 0, 0)),
                $lt: new Date(searchDate.setHours(23, 59, 59, 999))
            };
        }
        if (req.query.eventName) {
            filters.eventName = { $regex: req.query.eventName, $options: 'i' };
        }
        
        filters.isSold = false; // Only fetch listings that are not sold

        const listings = await Listing.find(filters).populate('seller', 'username');

        // Use Priority Queue to sort
        const pq = new PriorityQueue();
        listings.forEach(listing => pq.insert(listing));
        
        const sortedListings = [];
        while (!pq.isEmpty()) {
            sortedListings.push(pq.extractMax());
        }

        res.status(200).json(sortedListings);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching listings', error });
    }
});

// Get listings for the current user
app.get('/api/listings/my', async (req, res) => {
    const { userId } = req.query;
    if (!userId) {
        return res.status(400).json({ message: 'User ID is required' });
    }
    try {
        const listings = await Listing.find({ seller: userId }).sort({ createdAt: -1 });
        res.status(200).json(listings);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching user listings', error });
    }
});


// "Purchase" a listing (reveal contact info)
app.post('/api/listings/:id/purchase', async (req, res) => {
    try {
        const { userId } = req.body;
        const listing = await Listing.findById(req.params.id);
        if (!listing) return res.status(404).json({ message: 'Listing not found' });

        await User.findByIdAndUpdate(userId, { $push: { purchaseHistory: listing._id } });

        res.status(200).json({ contactInfo: listing.contactInfo });
    } catch (error) {
        res.status(500).json({ message: 'Error processing purchase', error });
    }
});

// Boost a listing
app.post('/api/listings/:id/boost', async (req, res) => {
    try {
        const listing = await Listing.findByIdAndUpdate(req.params.id, { isBoosted: true }, { new: true });
        res.status(200).json(listing);
    } catch (error) {
        res.status(500).json({ message: 'Error boosting listing', error });
    }
});

// Mark a listing as sold
app.post('/api/listings/:id/mark-sold', async (req, res) => {
    try {
        const listing = await Listing.findByIdAndUpdate(req.params.id, { isSold: true }, { new: true });
        res.status(200).json(listing);
    } catch (error) {
        res.status(500).json({ message: 'Error marking as sold', error });
    }
});

// Get unique event names for Trie autocomplete
app.get('/api/events', async (req, res) => {
    try {
        const eventNames = await Listing.distinct('eventName', { isSold: false });
        res.status(200).json(eventNames);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching event names', error });
    }
});


// --- SERVER START ---
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app; // For Vercel deployment