class Chat {
    constructor() {
        this.db = window.APP?.db;
        this.currentUser = null;
        this.currentChat = null;
        this.socket = null;
        this.typingUsers = new Set();
        this.typingTimeout = null;

        // Initialize Socket.IO with error handling
        this.initializeSocket();
        // Don't call initializeDOM here, it will be called on DOMContentLoaded
    }

    initializeSocket() {
        try {
            this.socket = io('https://chat-backend-p4u7.onrender.com', {
                transports: ['websocket'],
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000
            });

            this.socket.on('connect', () => {
                console.log('Socket connected:', this.socket.id);
                if (this.currentUser?.uid) {
                    this.socket.emit('user:connect', { userId: this.currentUser.uid });
                }
            });

            this.socket.on('disconnect', () => {
                console.log('Socket disconnected');
            });

            // Message handlers
            this.socket.on('message:received', (message) => this.handleReceivedMessage(message));
            this.socket.on('typing:started', ({ userId }) => this.handleTypingStarted(userId));
            this.socket.on('typing:stopped', ({ userId }) => this.handleTypingStopped(userId));
            this.socket.on('request:response', (data) => this.handleRequestResponse(data.chatId, data.status));
            this.socket.on('friend:request:received', (data) => this.handleFriendRequestReceived(data)); // New handler
            this.socket.on('friend:request:response', (data) => 
                this.handleFriendRequestResponse(data.requesterId, data.status)
            );

        } catch (error) {
            console.error('Socket initialization failed:', error);
            this.socket = null;
        }
    }

    initializeDOM() {
        this.messageForm = document.getElementById('messageForm');
        this.messageInput = document.getElementById('messageInput');
        this.messagesContainer = document.getElementById('messagesContainer');
        this.chatList = document.getElementById('chatList');
        this.newChatBtn = document.getElementById('newChatBtn');
        this.currentChatName = document.getElementById('currentChatName');
        this.friendSearchModal = document.getElementById('friendSearchModal');
        this.friendSearchForm = document.getElementById('friendSearchForm');
        this.friendSearchInput = document.getElementById('friendSearchInput');
        this.friendSearchResults = document.getElementById('friendSearchResults');
        this.sidebar = document.querySelector('.sidebar');
        this.navToggle = document.getElementById('navToggle');

        // Create typing indicator if missing
        if (this.messagesContainer && !document.getElementById('typingIndicator')) {
            this.typingIndicator = document.createElement('div');
            this.typingIndicator.id = 'typingIndicator';
            this.typingIndicator.className = 'typing-indicator';
            this.messagesContainer.prepend(this.typingIndicator);
        }

        // Make sure sidebar is initially visible on desktop and hidden on mobile
        this.updateSidebarVisibility();
        
        // Also add resize listener to handle window size changes
        window.addEventListener('resize', () => this.updateSidebarVisibility());

        this.initializeListeners();
    }

    // New method to properly handle sidebar visibility based on screen size
    updateSidebarVisibility() {
        if (!this.sidebar) return;
        
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            // On mobile, sidebar should be hidden by default
            this.sidebar.classList.remove('active');
            // Add appropriate mobile styling
            this.sidebar.classList.add('mobile-sidebar');
            
            // Make sure the main content adjusts
            document.querySelector('.chat-container')?.classList.add('full-width');
        } else {
            // On desktop, sidebar should be visible by default
            this.sidebar.classList.add('active');
            this.sidebar.classList.remove('mobile-sidebar');
            
            // Restore normal content width
            document.querySelector('.chat-container')?.classList.remove('full-width');
        }
    }

    initializeListeners() {
        // Message form
        this.messageForm?.addEventListener('submit', (e) => this.handleSendMessage(e));

        // New chat button
        this.newChatBtn?.addEventListener('click', () => this.handleNewChat());

        // Typing detection
        this.messageInput?.addEventListener('input', () => this.handleTypingDetection());

        // Friend search
        this.friendSearchForm?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.searchFriends();
        });

        // Modal controls
        document.getElementById('friendSearchBtn')?.addEventListener('click', () => {
            this.friendSearchModal.style.display = 'flex';
        });

        document.getElementById('closeFriendSearch')?.addEventListener('click', () => {
            this.friendSearchModal.style.display = 'none';
        });

        // Logout
        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            firebase.auth().signOut().then(() => window.location.reload());
        });

        // Enhanced navbar toggle for better mobile support
        if (this.navToggle && this.sidebar) {
            this.navToggle.addEventListener('click', () => {
                this.sidebar.classList.toggle('active');
                
                // On mobile, when sidebar is activated, add overlay
                if (window.innerWidth <= 768) {
                    if (this.sidebar.classList.contains('active')) {
                        this.createOrShowOverlay();
                    } else {
                        this.hideOverlay();
                    }
                }
            });
        }

        // Close sidebar when clicking outside on mobile
        document.addEventListener('click', (e) => {
            const isMobile = window.innerWidth <= 768;
            if (isMobile && this.sidebar && this.sidebar.classList.contains('active')) {
                // Check if click is outside sidebar and not on the toggle button
                if (!this.sidebar.contains(e.target) && e.target !== this.navToggle) {
                    this.sidebar.classList.remove('active');
                    this.hideOverlay();
                }
            }
        });
    }

    // Create overlay for mobile sidebar
    createOrShowOverlay() {
        let overlay = document.getElementById('sidebar-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'sidebar-overlay';
            overlay.className = 'sidebar-overlay';
            document.body.appendChild(overlay);
            
            // Close sidebar when overlay is clicked
            overlay.addEventListener('click', () => {
                this.sidebar.classList.remove('active');
                this.hideOverlay();
            });
        }
        overlay.style.display = 'block';
    }

    // Hide the overlay
    hideOverlay() {
        const overlay = document.getElementById('sidebar-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    // Typing detection method
    handleTypingDetection() {
        // Clear previous timeout
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }

        // Emit typing started event if in a chat
        if (this.currentChat && this.socket) {
            this.socket.emit('typing:start', {
                chatId: this.currentChat,
                userId: this.currentUser.uid,
                username: this.currentUser.username
            });
        }

        // Set timeout to stop typing after 2 seconds
        this.typingTimeout = setTimeout(() => {
            if (this.currentChat && this.socket) {
                this.socket.emit('typing:stop', {
                    chatId: this.currentChat,
                    userId: this.currentUser.uid
                });
            }
        }, 2000);
    }

    // Typing handlers
    handleTypingStarted(userId) {
        // Add user to typing set
        if (userId !== this.currentUser.uid) {
            this.typingUsers.add(userId);
            this.updateTypingIndicator();
        }
    }

    handleTypingStopped(userId) {
        // Remove user from typing set
        this.typingUsers.delete(userId);
        this.updateTypingIndicator();
    }

    initialize(user) {
        if (!user?.uid) {
            console.error('Invalid user in chat initialization:', user);
            return;
        }

        this.currentUser = {
            uid: user.uid,
            email: user.email,
            username: user.username || user.email.split('@')[0],
            mobile: user.mobile || ''
        };

        // Update UI
        document.getElementById('userName').textContent = this.currentUser.username;
        document.getElementById('userEmail').textContent = this.currentUser.email;
        this.messageInput && (this.messageInput.disabled = false);

        // Initialize socket connection if not already established
        if (!this.socket?.connected) {
            this.initializeSocket();
        } else {
            // Emit user connect if socket already connected
            this.socket.emit('user:connect', { userId: this.currentUser.uid });
        }

        // Listen for friend requests
        this.listenForFriendRequests();
        
        this.loadChats();
    }

    async loadChats() {
        try {
            console.log('Attempting to load all chats...');
            // Get both direct chats the user participates in and pending requests
            const chatsSnapshot = await this.db.collection('chats')
                .where('participants', 'array-contains', this.currentUser.uid)
                .get();
                
            console.log('Chats fetched:', chatsSnapshot.size, 'documents');
            this.chatList.innerHTML = '';
            if (chatsSnapshot.empty) {
                console.log('No chats exist in the database.');
                this.chatList.innerHTML = '<p>No chats available.</p>';
                return;
            }
            for (const doc of chatsSnapshot.docs) {
                const chat = { ...doc.data(), id: doc.id };
                console.log('Chat data:', chat);
                const chatElement = await this.createChatElement(chat);
                this.chatList.appendChild(chatElement);
            }
        } catch (error) {
            console.error('Detailed error loading chats:', error.code, error.message);
            this.chatList.innerHTML = `<p>Error loading chats: ${error.message}</p>`;
        }
    }

    async createChatElement(chat) {
        const div = document.createElement('div');
        div.className = 'chat-item';

        let chatName = chat.name || 'Unnamed Chat';
        if (chat.participants && chat.participants.length === 2 && chat.type === 'dm') {
            const otherUserId = chat.participants.find(id => id !== this.currentUser.uid);
            const userDoc = await this.db.collection('users').doc(otherUserId).get();
            chatName = userDoc.exists ? userDoc.data().username : 'Unknown User';
        } else {
            const creatorId = chat.creatorId || 'Unknown';
            const creatorDoc = await this.db.collection('users').doc(creatorId).get();
            chatName += ` (Created by: ${creatorDoc.exists ? creatorDoc.data().username : 'Unknown'})`;
        }

        div.textContent = chatName;
        
        // Add status indicator for pending friend requests
        if (chat.status === 'pending') {
            if (chat.creatorId === this.currentUser.uid) {
                const pendingLabel = document.createElement('span');
                pendingLabel.className = 'pending-label';
                pendingLabel.textContent = ' (Request Sent)';
                div.appendChild(pendingLabel);
            } else {
                const acceptBtn = document.createElement('button');
                acceptBtn.textContent = 'Accept';
                acceptBtn.className = 'accept-btn';
                acceptBtn.addEventListener('click', () => this.respondToFriendRequest(chat.id, true));
                
                const rejectBtn = document.createElement('button');
                rejectBtn.textContent = 'Reject';
                rejectBtn.className = 'reject-btn';
                rejectBtn.addEventListener('click', () => this.respondToFriendRequest(chat.id, false));
                
                div.appendChild(acceptBtn);
                div.appendChild(rejectBtn);
            }
        } else {
            const isParticipant = chat.participants && chat.participants.includes(this.currentUser.uid);
            if (isParticipant) {
                div.addEventListener('click', () => {
                    this.selectChat(chat.id);
                    // On mobile, auto-close the sidebar after selecting a chat
                    if (window.innerWidth <= 768 && this.sidebar) {
                        this.sidebar.classList.remove('active');
                        this.hideOverlay();
                    }
                });
            } else if (chat.type !== 'dm' || chat.participants.includes(this.currentUser.uid)) {
                const joinBtn = document.createElement('button');
                joinBtn.textContent = 'Request to Join';
                joinBtn.addEventListener('click', () => this.requestToJoin(chat.id));
                div.appendChild(joinBtn);
            }
        }

        if (chat.creatorId === this.currentUser.uid) {
            this.listenForRequests(chat.id);
        }

        return div;
    }

    async selectChat(chatId) {
        this.currentChat = chatId;

        try {
            const chatDoc = await this.db.collection('chats').doc(chatId).get();
            const chatData = chatDoc.data();

            if (!chatData || !chatData.participants.includes(this.currentUser.uid)) {
                alert('You need to be a participant to view this chat!');
                return;
            }

            if (this.currentChatName) {
                this.currentChatName.textContent = chatData.name || 'Chat';
                if (chatData.type === 'dm' && chatData.participants.length === 2) {
                    const otherUserId = chatData.participants.find(id => id !== this.currentUser.uid);
                    const userDoc = await this.db.collection('users').doc(otherUserId).get();
                    this.currentChatName.textContent = userDoc.exists ? userDoc.data().username : 'Unknown User';
                }
            }

            if (this.messageInput) {
                this.messageInput.disabled = false;
            }

            this.loadMessages(chatId);
            this.socket?.emit('chat:join', chatId);
        } catch (error) {
            console.error('Error selecting chat:', error);
        }
    }

    async loadMessages(chatId) {
        try {
            const messagesSnapshot = await this.db.collection('chats')
                .doc(chatId)
                .collection('messages')
                .orderBy('timestamp')
                .get();

            const tempIndicator = this.typingIndicator;
            this.messagesContainer.innerHTML = '';
            if (this.messagesContainer && tempIndicator) {
                this.messagesContainer.insertBefore(tempIndicator, this.messagesContainer.firstChild);
                console.log('Re-added typingIndicator after loadMessages:', tempIndicator);
            } else if (this.messagesContainer) {
                this.typingIndicator = document.createElement('div');
                this.typingIndicator.id = 'typingIndicator';
                this.typingIndicator.className = 'typing-indicator';
                this.messagesContainer.insertBefore(this.typingIndicator, this.messagesContainer.firstChild);
                console.log('Created new typingIndicator after loadMessages:', this.typingIndicator);
            }

            messagesSnapshot.forEach(doc => {
                const message = doc.data();
                const senderName = message.senderName || 'Unknown';
                this.displayMessage({ ...message, senderName });
            });

            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        } catch (error) {
            console.error('Error loading messages:', error);
        }
    }

    async handleSendMessage(e) {
        e.preventDefault();
        console.log('Handling send message...');
        console.log('Current chat ID:', this.currentChat);
        console.log('User UID:', this.currentUser.uid);

        if (!this.currentChat) {
            console.error('No chat selected');
            alert('Please select a chat first!');
            return;
        }

        if (!this.messageInput) {
            console.error('Message input not found');
            alert('Message input not found!');
            return;
        }

        const messageText = this.messageInput.value.trim();
        console.log('Message text:', messageText);
        if (!messageText) {
            console.log('Empty message, skipping');
            return;
        }

        try {
            const chatDoc = await this.db.collection('chats').doc(this.currentChat).get();
            const chatData = chatDoc.data();
            console.log('Chat data:', chatData);

            const message = {
                text: messageText,
                senderId: this.currentUser.uid,
                senderName: this.currentUser.username || this.currentUser.email,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            };
            console.log('Sending message:', message);

            await this.db.collection('chats')
                .doc(this.currentChat)
                .collection('messages')
                .add(message);

            this.socket?.emit('message:send', {
                ...message,
                chatId: this.currentChat
            });

            this.messageInput.value = '';
            this.displayMessage(message, true);
        } catch (error) {
            console.error('Error sending message:', error.code, error.message);
            alert(`Error sending message: ${error.message}`);
        }
    }

    async handleNewChat() {
        console.log('Handling new chat...');
        const chatName = prompt('Enter chat name or leave blank for DM:');
        if (chatName === null) {
            console.log('No chat name entered');
            return;
        }

        try {
            const chatData = {
                name: chatName || '',
                participants: [this.currentUser.uid],
                creatorId: this.currentUser.uid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                type: chatName ? 'group' : 'dm'
            };
            console.log('Creating chat with UID:', this.currentUser.uid);
            console.log('Chat data to write:', chatData);
            const chatRef = await this.db.collection('chats').add(chatData);
            console.log('Chat created with ID:', chatRef.id);

            await this.loadChats();
            this.selectChat(chatRef.id);
        } catch (error) {
            console.error('Error creating chat:', error.code, error.message);
            alert(`Error creating chat: ${error.message}`);
        }
    }

    displayMessage(message, isSent = false) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.senderId === this.currentUser?.uid ? 'sent' : 'received'}`;
        const textElement = document.createElement('span');
        textElement.textContent = message.text;
        const nameElement = document.createElement('small');
        nameElement.textContent = message.senderName;
        messageElement.appendChild(nameElement);
        messageElement.appendChild(textElement);
        this.messagesContainer.appendChild(messageElement);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    handleReceivedMessage(message) {
        if (message.chatId === this.currentChat) {
            this.displayMessage(message);
        }
    }

    updateTypingIndicator() {
        if (!this.typingIndicator) {
            console.error('typingIndicator is NULL, recreating...');
            this.typingIndicator = document.createElement('div');
            this.typingIndicator.id = 'typingIndicator';
            this.typingIndicator.className = 'typing-indicator';
            if (this.messagesContainer) {
                this.messagesContainer.insertBefore(this.typingIndicator, this.messagesContainer.firstChild);
                console.log('Recreated typingIndicator:', this.typingIndicator);
            }
        }
        console.log('Updating typingIndicator, users:', this.typingUsers.size, 'Element:', this.typingIndicator);
        if (this.typingUsers.size > 0) {
            const users = Array.from(this.typingUsers).join(', ');
            this.typingIndicator.textContent = `${users} ${this.typingUsers.size > 1 ? 'are' : 'is'} typing...`;
            console.log('Set text to:', this.typingIndicator.textContent);
        } else {
            this.typingIndicator.textContent = ''; // Clear text when no one is typing
            console.log('Cleared text');
        }
    }

    requestToJoin(chatId) {
        console.log('Sending join request for chat:', chatId);
        this.socket?.emit('request:join', { chatId, userId: this.currentUser.uid });
        alert('Join request sent!');
    }

    listenForRequests(chatId) {
        this.socket?.on('request:received', ({ chatId: requestedChatId, requesterId }) => {
            if (requestedChatId === chatId) {
                const response = confirm(`User ${requesterId} wants to join your chat. Accept?`);
                if (response) {
                    this.db.collection('chats').doc(chatId).update({
                        participants: firebase.firestore.FieldValue.arrayUnion(requesterId)
                    }).then(() => {
                        console.log(`Added ${requesterId} to chat ${chatId}`);
                    }).catch(error => {
                        console.error('Error adding participant:', error);
                    });
                }
                this.socket?.emit('request:respond', { chatId, requesterId, accept: response });
            }
        });
    }

    handleRequestResponse(chatId, status) {
        alert(`Your request to join chat ${chatId} was ${status ? 'accepted' : 'rejected'}!`);
        if (status) {
            this.loadChats();
            this.selectChat(chatId);
        }
    }

    async searchFriends() {
    const searchTerm = this.friendSearchInput.value.trim().toLowerCase();
    if (!searchTerm) {
        alert('Please enter a username or mobile number!');
        return;
    }

    try {
        // Get all users and filter client-side for better partial matches
        const usersSnapshot = await this.db.collection('users').get();
        
        this.friendSearchResults.innerHTML = '';
        let foundUsers = false;

        usersSnapshot.forEach(doc => {
            const user = { id: doc.id, ...doc.data() };
            // Skip current user
            if (user.id === this.currentUser.uid) return;

            // Check if username or mobile contains search term
            const username = (user.username || '').toLowerCase();
            const mobile = (user.mobile || '').toLowerCase();
            
            if (username.includes(searchTerm) || mobile.includes(searchTerm)) {
                foundUsers = true;
                const friendItem = document.createElement('div');
                friendItem.className = 'friend-item';
                friendItem.innerHTML = `
                    <span>${user.username} ${user.mobile ? `(${user.mobile})` : ''}</span>
                    <button class="friend-request-btn" data-uid="${user.id}">Send Friend Request</button>
                `;
                
                const button = friendItem.querySelector('.friend-request-btn');
                button.addEventListener('click', (e) => {
                    const uid = e.currentTarget.getAttribute('data-uid');
                    this.sendFriendRequest(uid);
                });
                
                this.friendSearchResults.appendChild(friendItem);
            }
        });

        if (!foundUsers) {
            this.friendSearchResults.innerHTML = '<p>No users found.</p>';
        }

    } catch (error) {
        console.error('Error searching friends:', error);
        this.friendSearchResults.innerHTML = `<p>Error: ${error.message}</p>`;
    }
}
    async sendFriendRequest(friendUid) {
        // Debugging - let's see what we're receiving
        console.log('Friend UID received:', friendUid);
        console.log('Current user:', this.currentUser);
    
        if (!friendUid) {
            console.error('No friend UID provided');
            alert('Invalid friend selection - please try again');
            return;
        }
    
        if (!this.currentUser?.uid) {
            console.error('Current user not initialized');
            alert('Please wait until you are fully logged in');
            return;
        }
    
        if (this.currentUser.uid === friendUid) {
            alert("You can't friend yourself!");
            return;
        }
    
        try {
            // Create the chat document
            const chatRef = await this.db.collection('chats').add({
                participants: [this.currentUser.uid, friendUid],
                creatorId: this.currentUser.uid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                type: 'dm',
                status: 'pending'
            });
    
            console.log('Friend request chat created with ID:', chatRef.id);
            
            // Use socket to notify the recipient
            this.socket?.emit('friend:request:send', {
                requesterId: this.currentUser.uid,
                requesterName: this.currentUser.username,
                recipientId: friendUid,
                chatId: chatRef.id
            });
            
            alert('Friend request sent successfully!');
            this.friendSearchModal.style.display = 'none';
    
        } catch (error) {
            console.error('Error sending friend request:', error);
            alert(`Failed to send request: ${error.message}`);
        }
    }

    handleFriendRequestReceived(data) {
        console.log('Friend request received:', data);
        // Update UI to show new request
        this.loadChats();
        // Optional: Show notification
        alert(`You received a friend request from ${data.requesterName || 'Unknown user'}`);
    }

    listenForFriendRequests() {
        // Query for pending friend requests where user is a participant
        this.db.collection('chats')
            .where('participants', 'array-contains', this.currentUser.uid)
            .where('status', '==', 'pending')
            .where('creatorId', '!=', this.currentUser.uid)
            .onSnapshot(snapshot => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const data = change.doc.data();
                        console.log('New friend request detected:', data);
                        // Update UI or show notification
                        alert(`You received a friend request! Check your chats list.`);
                        this.loadChats();
                    }
                });
            }, error => {
                console.error('Error listening for friend requests:', error);
            });
    }

    async respondToFriendRequest(chatId, accept) {
        try {
            const chatRef = this.db.collection('chats').doc(chatId);
            const chatDoc = await chatRef.get();
            
            if (!chatDoc.exists) {
                console.error('Chat document not found');
                return;
            }
            
            const chatData = chatDoc.data();
            const requesterId = chatData.creatorId;
            
            if (accept) {
                // Update chat status to active
                await chatRef.update({
                    status: 'active'
                });
                
                // Notify the requester
                this.socket?.emit('friend:request:respond', {
                    chatId,
                    requesterId,
                    recipientId: this.currentUser.uid,
                    status: true
                });
                
                alert('Friend request accepted!');
                this.loadChats();
                this.selectChat(chatId);
            } else {
                // Delete the chat document
                await chatRef.delete();
                
                // Notify the requester of rejection
                this.socket?.emit('friend:request:respond', {
                    chatId,
                    requesterId,
                    recipientId: this.currentUser.uid,
                    status: false
                });
                
                alert('Friend request rejected.');
                this.loadChats();
            }
        } catch (error) {
            console.error('Error responding to friend request:', error);
            alert(`Error: ${error.message}`);
        }
    }

    handleFriendRequestResponse(requesterId, status) {
        if (status) {
            alert(`Friend request from ${requesterId} accepted! You can now chat.`);
            this.loadChats();
        } else {
            alert(`Friend request from ${requesterId} rejected.`);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Check Firebase initialization
    if (!window.APP?.db) {
        console.error('Firebase not initialized!');
        return;
    }

    // Initialize Chat
    window.chatInstance = new Chat();
    window.chatInstance.initializeDOM();
});
