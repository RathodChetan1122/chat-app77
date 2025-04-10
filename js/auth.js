class Auth {
    constructor() {
        // Initialize Firebase Auth and Firestore
        this.auth = window.APP.auth;
        this.db = window.APP.db;

        // Get DOM elements
        this.authModal = document.getElementById('authModal');
        this.googleLoginBtn = document.getElementById('googleLogin');
        this.emailAuthForm = document.getElementById('emailAuthForm');
        this.toggleRegisterBtn = document.getElementById('toggleRegister');
        this.logoutBtn = document.getElementById('logoutBtn');

        // State
        this.isRegistering = false;
        this.currentUser = null;

        // Initialize listeners
        this.initializeListeners();
        
        // Initialize auth state
        this.initAuthState();
        
        // Initial form setup
        this.setupFormFields();
    }

    initAuthState() {
        // Set up persistent auth state listener
        this.auth.onAuthStateChanged(user => {
            try {
                this.handleAuthStateChange(user);
            } catch (error) {
                console.error('Auth state change error:', error);
                alert('Authentication error: ' + error.message);
            }
        });
    }
    
    setupFormFields() {
        // Check if we're in registration or login mode and show/hide fields accordingly
        const emailInput = document.getElementById('emailInput');
        const usernameInput = document.getElementById('usernameInput');
        const mobileInput = document.getElementById('mobileInput');
        
        if (!this.isRegistering) {
            if (!document.getElementById('loginIdentifier')) {
                const loginField = document.createElement('input');
                loginField.type = 'text';
                loginField.id = 'loginIdentifier';
                loginField.name = 'loginIdentifier'; // Added name attribute
                loginField.placeholder = 'Email, Username or Mobile';
                loginField.required = true;
                this.emailAuthForm.insertBefore(loginField, this.emailAuthForm.firstChild);
            }
            
            if (emailInput) emailInput.style.display = 'none';
            if (usernameInput) usernameInput.style.display = 'none';
            if (mobileInput) mobileInput.style.display = 'none';
        }
    }

    initializeListeners() {
        // Google login
        this.googleLoginBtn?.addEventListener('click', () => this.handleGoogleLogin());

        // Email auth form
        this.emailAuthForm?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleEmailAuth(e);
        });

        // Toggle register mode
        this.toggleRegisterBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            this.isRegistering = !this.isRegistering;
            this.toggleRegisterBtn.textContent = this.isRegistering ? "Login" : "Register";
            document.querySelector('#emailAuthForm button').textContent = 
                this.isRegistering ? "Register" : "Login";
            
            const emailInput = document.getElementById('emailInput');
            const usernameInput = document.getElementById('usernameInput');
            const mobileInput = document.getElementById('mobileInput');
            const loginIdentifier = document.getElementById('loginIdentifier');
            
            if (this.isRegistering) {
                if (emailInput) {
                    emailInput.style.display = 'block';
                    emailInput.required = true; // Add required
                }
                if (usernameInput) {
                    usernameInput.style.display = 'block';
                    usernameInput.required = true; // Add required
                }
                if (mobileInput) {
                    mobileInput.style.display = 'block';
                    mobileInput.required = true; // Add required
                }
                if (loginIdentifier) loginIdentifier.style.display = 'none';
            } else {
                if (emailInput) {
                    emailInput.style.display = 'none';
                    emailInput.required = false; // Remove required
                }
                if (usernameInput) {
                    usernameInput.style.display = 'none';
                    usernameInput.required = false; // Remove required
                }
                if (mobileInput) {
                    mobileInput.style.display = 'none';
                    mobileInput.required = false; // Remove required
                }
                if (loginIdentifier) loginIdentifier.style.display = 'block';
                
                if (!loginIdentifier) {
                    const loginField = document.createElement('input');
                    loginField.type = 'text';
                    loginField.id = 'loginIdentifier';
                    loginField.name = 'loginIdentifier';
                    loginField.placeholder = 'Email, Username or Mobile';
                    loginField.required = true;
                    this.emailAuthForm.insertBefore(loginField, this.emailAuthForm.firstChild);
                }
            }
        });
        // Logout
        this.logoutBtn?.addEventListener('click', () => this.handleLogout());
    }

    async handleGoogleLogin() {
        try {
            const provider = new firebase.auth.GoogleAuthProvider();
            const result = await this.auth.signInWithPopup(provider);
            await this.saveUserToFirestore(result.user, null, null);
        } catch (error) {
            console.error('Google login error:', error);
            alert('Google login failed: ' + error.message);
        }
    }

    async handleEmailAuth(e) {
        try {
            if (this.isRegistering) {
                const email = document.getElementById('emailInput').value;
                const password = document.getElementById('passwordInput').value;
                const username = document.getElementById('usernameInput').value;
                const mobile = document.getElementById('mobileInput').value;
                
                const isDuplicate = await this.checkForDuplicates(email, username, mobile);
                if (isDuplicate) return;
                
                const userCredential = await this.auth.createUserWithEmailAndPassword(email, password);
                await this.saveUserToFirestore(userCredential.user, username, mobile);
            } else {
                const identifier = document.getElementById('loginIdentifier').value;
                const password = document.getElementById('passwordInput').value;
                await this.loginWithIdentifier(identifier, password);
            }
        } catch (error) {
            console.error('Auth error:', error);
            alert((this.isRegistering ? 'Registration' : 'Login') + ' failed: ' + error.message);
        }
    }
    
    async checkForDuplicates(email, username, mobile) {
        try {
            const emailQuery = await this.db.collection('users')
                .where('email', '==', email)
                .get();
            if (!emailQuery.empty) {
                alert('This email is already registered. Please use a different email.');
                return true;
            }
            
            const usernameQuery = await this.db.collection('users')
                .where('username', '==', username)
                .get();
            if (!usernameQuery.empty) {
                alert('This username is already taken. Please choose a different username.');
                return true;
            }
            
            const mobileQuery = await this.db.collection('users')
                .where('mobile', '==', mobile)
                .get();
            if (!mobileQuery.empty) {
                alert('This mobile number is already registered. Please use a different number.');
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Duplicate check error:', error);
            alert('Error checking for duplicate values: ' + error.message);
            return true;
        }
    }
    
    async loginWithIdentifier(identifier, password) {
        try {
            if (identifier.includes('@')) {
                await this.auth.signInWithEmailAndPassword(identifier, password);
                return;
            }
            
            const usernameQuery = await this.db.collection('users')
                .where('username', '==', identifier)
                .get();
            
            if (usernameQuery.empty) {
                const mobileQuery = await this.db.collection('users')
                    .where('mobile', '==', identifier)
                    .get();
                
                if (!mobileQuery.empty) {
                    const userData = mobileQuery.docs[0].data();
                    if (userData.email) {
                        await this.auth.signInWithEmailAndPassword(userData.email, password);
                        return;
                    }
                }
            } else {
                const userData = usernameQuery.docs[0].data();
                if (userData.email) {
                    await this.auth.signInWithEmailAndPassword(userData.email, password);
                    return;
                }
            }
            
            throw new Error('No account found with the provided identifier');
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }

    async saveUserToFirestore(user, username, mobile) {
        try {
            const userRef = this.db.collection('users').doc(user.uid);
            const userDoc = await userRef.get();

            if (!userDoc.exists) {
                await userRef.set({
                    email: user.email,
                    username: username || user.displayName || user.email.split('@')[0],
                    mobile: mobile || '',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastLogin: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else {
                await userRef.update({
                    lastLogin: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        } catch (error) {
            console.error('Firestore save error:', error);
            throw error;
        }
    }

    async handleLogout() {
        try {
            await this.auth.signOut();
        } catch (error) {
            console.error('Logout error:', error);
            alert('Logout failed: ' + error.message);
        }
    }

    async handleAuthStateChange(user) {
        this.currentUser = user;
        if (user) {
            this.authModal.style.display = 'none';
            
            try {
                const userDoc = await this.db.collection('users').doc(user.uid).get();
                const userData = userDoc.exists ? userDoc.data() : {};
                
                document.getElementById('userName').textContent = 
                    userData.username || user.displayName || user.email;
                document.getElementById('userEmail').textContent = user.email;
                
                if (user.photoURL) {
                    document.getElementById('userAvatar').src = user.photoURL;
                }

                if (window.chatInstance && typeof window.chatInstance.initialize === 'function') {
                    window.chatInstance.initialize({
                        uid: user.uid,
                        email: user.email,
                        ...userData
                    });
                } else {
                    console.warn('Chat instance not initialized yet or missing initialize method');
                }
            } catch (error) {
                console.error('User data fetch error:', error);
                if (window.chatInstance && typeof window.chatInstance.initialize === 'function') {
                    window.chatInstance.initialize({
                        uid: user.uid,
                        email: user.email
                    });
                }
            }
        } else {
            this.authModal.style.display = 'flex';
            document.getElementById('userName').textContent = 'Not logged in';
            document.getElementById('userEmail').textContent = '';
            document.getElementById('userAvatar').src = 'https://via.placeholder.com/50';
            
            this.isRegistering = false;
            this.toggleRegisterBtn.textContent = "Register";
            document.querySelector('#emailAuthForm button').textContent = "Login";
            
            this.setupFormFields();
            
            if (window.chatInstance && typeof window.chatInstance.reset === 'function') {
                window.chatInstance.reset();
            } else {
                console.warn('Chat instance not available or reset method not defined');
            }
        }
    }
}

// Initialize only after Firebase is ready
document.addEventListener('DOMContentLoaded', () => {
    if (window.APP && window.APP.auth) {
        window.authInstance = new Auth();
    } else {
        console.error('Firebase not initialized!');
    }
});