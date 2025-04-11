class Chat {
    constructor() {
        this.db = window.APP?.db;
        this.currentUser = null;
        this.currentChat = null;
        this.socket = null;
        this.typingUsers = new Set();
        this.typingTimeout = null;
        this.replyingTo = null; // Track the message being replied to
        this.highlightTimeout = null; // For highlighting pinned message

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
            this.socket.on('friend:request:received', (data) => this.handleFriendRequestReceived(data));
            this.socket.on('friend:request:response', (data) => 
                this.handleFriendRequestResponse(data.requesterId, data.status)
            );
            this.socket.on('message:update', (data) => this.handleMessageUpdate(data));
            this.socket.on('message:delete', (data) => this.handleMessageDelete(data));

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
            this.messagesContainer.appendChild(this.typingIndicator); // Append after pinned display
            console.log('Typing indicator created and appended');
        }

        // Create pinned message display if missing
        if (this.messagesContainer && !document.getElementById('pinnedMessageDisplay')) {
            this.pinnedMessageDisplay = document.createElement('div');
            this.pinnedMessageDisplay.id = 'pinnedMessageDisplay';
            this.pinnedMessageDisplay.className = 'pinned-message';
            this.messagesContainer.insertBefore(this.pinnedMessageDisplay, this.messagesContainer.firstChild); // Insert at top
            console.log('Pinned message display created and inserted at top');
        } else {
            this.pinnedMessageDisplay = document.getElementById('pinnedMessageDisplay');
            this.pinnedMessageDisplay.classList.remove('hidden'); // Ensure it's visible by default
            console.log('Pinned message display found in DOM');
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
            this.sidebar.classList.remove('active');
            this.sidebar.classList.add('mobile-sidebar');
            document.querySelector('.chat-container')?.classList.add('full-width');
        } else {
            this.sidebar.classList.add('active');
            this.sidebar.classList.remove('mobile-sidebar');
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
                if (!this.sidebar.contains(e.target) && e.target !== this.navToggle) {
                    this.sidebar.classList.remove('active');
                    this.hideOverlay();
                }
            }
        });

        // Message options (hover for desktop, long-press for mobile)
        this.messagesContainer.addEventListener('mouseover', (e) => {
            if (window.innerWidth > 768) { // Desktop
                const messageElement = e.target.closest('.message');
                if (messageElement && !messageElement.querySelector('.message-options')) {
                    this.showMessageOptions(messageElement);
                }
            }
        });

        this.messagesContainer.addEventListener('touchstart', (e) => {
            if (window.innerWidth <= 768) { // Mobile
                const messageElement = e.target.closest('.message');
                if (messageElement) {
                    this.startLongPress(messageElement, e);
                }
            }
        }, { passive: true });

        this.messagesContainer.addEventListener('touchend', () => {
            clearTimeout(this.longPressTimeout);
        });

        // Cancel reply on input focus if no reply is intended
        this.messageInput.addEventListener('focus', () => {
            if (!this.messageInput.value.trim()) {
                this.cancelReply();
            }
        });

        // Pinned message display click listener
        this.pinnedMessageDisplay?.addEventListener('click', () => this.navigateToPinnedMessage());
    }

    createOrShowOverlay() {
        let overlay = document.getElementById('sidebar-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'sidebar-overlay';
            overlay.className = 'sidebar-overlay';
            document.body.appendChild(overlay);
            overlay.addEventListener('click', () => {
                this.sidebar.classList.remove('active');
                this.hideOverlay();
            });
        }
        overlay.style.display = 'block';
    }

    hideOverlay() {
        const overlay = document.getElementById('sidebar-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    handleTypingDetection() {
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }

        if (this.currentChat && this.socket) {
            this.socket.emit('typing:start', {
                chatId: this.currentChat,
                userId: this.currentUser.uid,
                username: this.currentUser.username
            });
        }

        this.typingTimeout = setTimeout(() => {
            if (this.currentChat && this.socket) {
                this.socket.emit('typing:stop', {
                    chatId: this.currentChat,
                    userId: this.currentUser.uid
                });
            }
        }, 2000);
    }

    handleTypingStarted(userId) {
        if (userId !== this.currentUser.uid) {
            this.typingUsers.add(userId);
            this.updateTypingIndicator();
        }
    }

    handleTypingStopped(userId) {
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

        document.getElementById('userName').textContent = this.currentUser.username;
        document.getElementById('userEmail').textContent = this.currentUser.email;
        this.messageInput && (this.messageInput.disabled = false);

        if (!this.socket?.connected) {
            this.initializeSocket();
        } else {
            this.socket.emit('user:connect', { userId: this.currentUser.uid });
        }

        this.listenForFriendRequests();
        this.loadChats();
    }

    async loadChats() {
        try {
            console.log('Attempting to load all chats...');
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

            this.messagesContainer.innerHTML = ''; // Clear existing content
            if (this.typingIndicator) {
                this.messagesContainer.appendChild(this.typingIndicator); // Re-append typing indicator
            } else {
                this.typingIndicator = document.createElement('div');
                this.typingIndicator.id = 'typingIndicator';
                this.typingIndicator.className = 'typing-indicator';
                this.messagesContainer.appendChild(this.typingIndicator);
                console.log('New typing indicator created');
            }
            this.messagesContainer.insertBefore(this.pinnedMessageDisplay, this.messagesContainer.firstChild); // Ensure pinned display is at the top
            console.log('Pinned message display re-positioned at top');

            // Load pinned messages first
            const pinnedMessages = [];
            messagesSnapshot.forEach(doc => {
                const message = { ...doc.data(), id: doc.id };
                if (message.pinned) {
                    pinnedMessages.push(message);
                } else {
                    this.displayMessage(message, doc.id);
                }
            });
            pinnedMessages.forEach(message => this.displayMessage(message, message.id));

            this.updatePinnedMessageDisplay(pinnedMessages.length > 0 ? pinnedMessages[pinnedMessages.length - 1] : null);
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
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                replyToId: this.replyingTo ? this.replyingTo.id : null,
                replyToText: this.replyingTo ? this.replyingTo.text : null,
                replyToSender: this.replyingTo ? this.replyingTo.senderName : null
            };
            console.log('Sending message:', message);

            const messageRef = await this.db.collection('chats')
                .doc(this.currentChat)
                .collection('messages')
                .add(message);

            this.socket?.emit('message:send', {
                ...message,
                chatId: this.currentChat,
                messageId: messageRef.id
            });

            this.messageInput.value = '';
            this.displayMessage(message, messageRef.id);
            this.cancelReply(); // Clear reply state after sending
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

    displayMessage(message, messageId) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.senderId === this.currentUser?.uid ? 'sent' : 'received'} new-message`;
        messageElement.dataset.messageId = messageId; // Store message ID for replies and options

        const nameElement = document.createElement('small');
        nameElement.textContent = message.senderName;

        const textElement = document.createElement('span');
        textElement.textContent = message.text;

        // Handle reply context
        if (message.replyToId) {
            const replyContainer = document.createElement('div');
            replyContainer.className = 'message-reply';
            const replyText = document.createElement('span');
            replyText.textContent = `${message.replyToSender}: ${message.replyToText}`;
            replyContainer.appendChild(replyText);
            messageElement.appendChild(replyContainer);
        }

        // Pin indicator
        if (message.pinned) {
            const pinIcon = document.createElement('span');
            pinIcon.className = 'pin-icon';
            pinIcon.textContent = '📌';
            messageElement.appendChild(pinIcon);
        }

        messageElement.appendChild(nameElement);
        messageElement.appendChild(textElement);
        this.messagesContainer.appendChild(messageElement);
        setTimeout(() => messageElement.classList.remove('new-message'), 300);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    handleReceivedMessage(message) {
        if (message.chatId === this.currentChat) {
            this.displayMessage(message, message.messageId);
            if (message.pinned) {
                this.updatePinnedMessageDisplay(message);
                console.log('Received pinned message, updating display');
            }
        }
    }

    handleMessageUpdate(data) {
        if (data.chatId === this.currentChat) {
            const messageElement = this.messagesContainer.querySelector(`[data-message-id="${data.messageId}"]`);
            if (messageElement) {
                const pinIcon = messageElement.querySelector('.pin-icon');
                if (data.pinned && !pinIcon) {
                    const newPinIcon = document.createElement('span');
                    newPinIcon.className = 'pin-icon';
                    newPinIcon.textContent = '📌';
                    messageElement.appendChild(newPinIcon);
                    this.updatePinnedMessageDisplay({ id: data.messageId, text: messageElement.querySelector('span').textContent, senderName: messageElement.querySelector('small').textContent });
                    console.log('Message pinned, display updated');
                } else if (!data.pinned && pinIcon) {
                    pinIcon.remove();
                    this.updatePinnedMessageDisplay(null);
                    console.log('Message unpinned, display cleared');
                }
            }
        }
    }

    handleMessageDelete(data) {
        if (data.chatId === this.currentChat) {
            const messageElement = this.messagesContainer.querySelector(`[data-message-id="${data.messageId}"]`);
            if (messageElement) messageElement.remove();
            this.updatePinnedMessageDisplay(null); // Recheck pinned status after delete
            console.log('Message deleted, checking pinned display');
        }
    }

    updateTypingIndicator() {
        if (!this.typingIndicator) {
            console.error('typingIndicator is NULL, recreating...');
            this.typingIndicator = document.createElement('div');
            this.typingIndicator.id = 'typingIndicator';
            this.typingIndicator.className = 'typing-indicator';
            if (this.messagesContainer) {
                this.messagesContainer.appendChild(this.typingIndicator);
                console.log('Recreated typingIndicator');
            }
        }
        console.log('Updating typingIndicator, users:', this.typingUsers.size, 'Element:', this.typingIndicator);
        if (this.typingUsers.size > 0) {
            const users = Array.from(this.typingUsers).join(', ');
            this.typingIndicator.textContent = `${users} ${this.typingUsers.size > 1 ? 'are' : 'is'} typing...`;
        } else {
            this.typingIndicator.textContent = ''; // Clear text when no one is typing
        }
    }

    updatePinnedMessageDisplay(pinnedMessage) {
        if (!this.pinnedMessageDisplay) {
            console.error('pinnedMessageDisplay is NULL, recreating...');
            this.pinnedMessageDisplay = document.createElement('div');
            this.pinnedMessageDisplay.id = 'pinnedMessageDisplay';
            this.pinnedMessageDisplay.className = 'pinned-message';
            if (this.messagesContainer) {
                this.messagesContainer.insertBefore(this.pinnedMessageDisplay, this.messagesContainer.firstChild);
                console.log('Recreated pinnedMessageDisplay at top');
            }
        }

        console.log('Updating pinned message display:', pinnedMessage);
        if (pinnedMessage) {
            this.pinnedMessageDisplay.classList.remove('hidden');
            this.pinnedMessageDisplay.innerHTML = `
                <span>Pinned Message</span>
                <span>${pinnedMessage.senderName}: ${pinnedMessage.text}</span>
            `;
            this.pinnedMessageDisplay.dataset.messageId = pinnedMessage.id;
            console.log('Pinned message set:', pinnedMessage.text);
        } else {
            this.pinnedMessageDisplay.classList.add('hidden');
            this.pinnedMessageDisplay.innerHTML = '';
            this.pinnedMessageDisplay.dataset.messageId = '';
            console.log('No pinned message, display hidden');
        }
    }

    navigateToPinnedMessage() {
        const messageId = this.pinnedMessageDisplay.dataset.messageId;
        if (messageId) {
            const messageElement = this.messagesContainer.querySelector(`[data-message-id="${messageId}"]`);
            if (messageElement) {
                messageElement.scrollIntoView({ behavior: 'smooth' });
                if (this.highlightTimeout) clearTimeout(this.highlightTimeout);
                messageElement.classList.add('highlighted');
                this.highlightTimeout = setTimeout(() => {
                    messageElement.classList.remove('highlighted');
                }, 2000); // Highlight for 2 seconds
                console.log('Navigated to pinned message:', messageId);
            } else {
                console.warn('Pinned message element not found:', messageId);
            }
        } else {
            console.warn('No messageId in pinnedMessageDisplay');
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
            const usersSnapshot = await this.db.collection('users').get();
            this.friendSearchResults.innerHTML = '';
            let foundUsers = false;

            usersSnapshot.forEach(doc => {
                const user = { id: doc.id, ...doc.data() };
                if (user.id === this.currentUser.uid) return;

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
            const chatRef = await this.db.collection('chats').add({
                participants: [this.currentUser.uid, friendUid],
                creatorId: this.currentUser.uid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                type: 'dm',
                status: 'pending'
            });

            console.log('Friend request chat created with ID:', chatRef.id);
            
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
        this.loadChats();
        alert(`You received a friend request from ${data.requesterName || 'Unknown user'}`);
    }

    listenForFriendRequests() {
        this.db.collection('chats')
            .where('participants', 'array-contains', this.currentUser.uid)
            .where('status', '==', 'pending')
            .where('creatorId', '!=', this.currentUser.uid)
            .onSnapshot(snapshot => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const data = change.doc.data();
                        console.log('New friend request detected:', data);
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
                await chatRef.update({
                    status: 'active'
                });
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
                await chatRef.delete();
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

    reset() {
        this.currentChat = null;
        this.currentUser = null;
        if (this.messagesContainer) this.messagesContainer.innerHTML = '';
        if (this.currentChatName) this.currentChatName.textContent = 'Select a chat';
        if (this.messageInput) this.messageInput.disabled = true;
        if (this.typingUsers) this.typingUsers.clear();
        if (this.typingIndicator) this.typingIndicator.textContent = '';
        if (this.pinnedMessageDisplay) this.pinnedMessageDisplay.classList.add('hidden');
        this.cancelReply(); // Clear reply state on reset
        console.log('Chat reset');
    }

    // New methods for message options
    startLongPress(messageElement, e) {
        this.longPressTimeout = setTimeout(() => {
            this.showMessageOptions(messageElement);
        }, 500); // 500ms long-press threshold
    }

    async showMessageOptions(messageElement) {
        const messageId = messageElement.dataset.messageId;
        const senderId = messageElement.classList.contains('sent') ? this.currentUser.uid : null;
        const isSender = senderId === this.currentUser.uid;
        const chatDoc = this.db.collection('chats').doc(this.currentChat).get();
        const isAdmin = (await chatDoc).data().participants.includes(this.currentUser.uid) && this.currentUser.uid === (await chatDoc).data().creatorId;

        // Remove existing options if any
        const existingOptions = messageElement.querySelector('.message-options');
        if (existingOptions) existingOptions.remove();

        const options = document.createElement('div');
        options.className = 'message-options';
        options.innerHTML = `
            <button class="option-btn" data-action="reply">Reply</button>
            <button class="option-btn" data-action="pin">Pin</button>
            ${isSender || isAdmin ? '<button class="option-btn" data-action="delete">Delete</button>' : ''}
        `;
        messageElement.appendChild(options);

        // Add event listeners to options
        options.querySelectorAll('.option-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                this.handleOptionAction(action, messageElement, messageId);
                options.remove(); // Remove options after action
            });
        });

        // Hide options on click outside
        document.addEventListener('click', this.hideOptionsOnOutsideClick.bind(this, options), { once: true });
    }

    hideOptionsOnOutsideClick(options, e) {
        if (!options.contains(e.target) && e.target.closest('.message') !== options.parentElement) {
            options.remove();
        }
    }

    async handleOptionAction(action, messageElement, messageId) {
        const senderId = messageElement.classList.contains('sent') ? this.currentUser.uid : null;
        const isSender = senderId === this.currentUser.uid;
        const chatDoc = await this.db.collection('chats').doc(this.currentChat).get();
        const isAdmin = chatDoc.data().participants.includes(this.currentUser.uid) && this.currentUser.uid === chatDoc.data().creatorId;

        switch (action) {
            case 'reply':
                this.startReply(messageElement);
                break;
            case 'pin':
                if (isSender || isAdmin) {
                    await this.pinMessage(messageId, messageElement);
                } else {
                    alert('Only the sender or admin can pin messages!');
                }
                break;
            case 'delete':
                if (isSender || isAdmin) {
                    await this.deleteMessage(messageId);
                } else {
                    alert('You can only delete your own messages or if you are an admin!');
                }
                break;
        }
    }

    async pinMessage(messageId, messageElement) {
        const messageRef = this.db.collection('chats').doc(this.currentChat).collection('messages').doc(messageId);
        const doc = await messageRef.get();
        if (doc.exists) {
            const pinned = !doc.data().pinned;
            await messageRef.update({ pinned });
            const notify = confirm('Notify all members about this pinned message?');
            this.socket?.emit('message:update', { chatId: this.currentChat, messageId, pinned, notify });
            if (pinned && !messageElement.querySelector('.pin-icon')) {
                const pinIcon = document.createElement('span');
                pinIcon.className = 'pin-icon';
                pinIcon.textContent = '📌';
                messageElement.appendChild(pinIcon);
            } else if (!pinned && messageElement.querySelector('.pin-icon')) {
                messageElement.querySelector('.pin-icon').remove();
            }
            this.updatePinnedMessageDisplay({ id: messageId, text: messageElement.querySelector('span').textContent, senderName: messageElement.querySelector('small').textContent });
            console.log('Pinned message updated in display');
        }
    }

    async deleteMessage(messageId) {
        const messageRef = this.db.collection('chats').doc(this.currentChat).collection('messages').doc(messageId);
        await messageRef.delete();
        this.socket?.emit('message:delete', { chatId: this.currentChat, messageId });
        const messageElement = this.messagesContainer.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) messageElement.remove();
    }

    // Existing reply methods
    startReply(messageElement) {
        const messageId = messageElement.dataset.messageId;
        const senderName = messageElement.querySelector('small').textContent;
        const text = messageElement.querySelector('span').textContent.replace(/\n/g, ' '); // Remove newlines for display
        this.replyingTo = { id: messageId, senderName, text };
        this.updateReplyUI();
    }

    updateReplyUI() {
        const replyContainer = document.createElement('div');
        replyContainer.className = 'reply-container';
        const replyBox = document.createElement('div');
        replyBox.className = 'reply-box';
        replyBox.innerHTML = `
            <span class="reply-text">${this.replyingTo.senderName}: ${this.replyingTo.text}</span>
            <button class="cancel-reply">✖</button>
        `;
        replyContainer.appendChild(replyBox);
        if (!document.querySelector('.reply-container')) {
            this.messageForm.insertBefore(replyContainer, this.messageInput.parentElement);
        }
        replyBox.querySelector('.cancel-reply').addEventListener('click', () => this.cancelReply());
    }

    cancelReply() {
        this.replyingTo = null;
        const replyContainer = document.querySelector('.reply-container');
        if (replyContainer) {
            replyContainer.remove();
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