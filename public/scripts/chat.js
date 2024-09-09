document.addEventListener('DOMContentLoaded', () => {
            const socket = io();
            const userId = <%= userId %>;
            const friendId = <%= friendId %>;
            const friendName = '<%= friendName %>';

            socket.emit('joinRoom', { userId, friendId });

            const messageForm = document.getElementById('message-form');
            const messageInput = document.getElementById('message-input');
            const messages = document.getElementById('messages');
            const typingStatus = document.getElementById('typing-status');
            const friendsList = document.getElementById('friends-list');

            function scrollToBottom() {
                messages.scrollTop = messages.scrollHeight;
            }

            function updateActiveFriend() {
                document.querySelectorAll('#friends-list li').forEach(item => {
                    item.classList.toggle('active', item.getAttribute('data-id') === friendId);
                });
            }

            updateActiveFriend();
            scrollToBottom();

            messageForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const content = messageInput.value.trim();
                if (content) {
                    socket.emit('sendMessage', { senderId: userId, receiverId: friendId, content });
                    messageInput.value = '';
                    messageInput.focus();
                }
            });

            socket.on('receiveMessage', (data) => {
                const messageElement = document.createElement('li');
                messageElement.className = data.senderId === userId ? 'you' : 'friend';
                messageElement.innerHTML = `<strong>${data.senderId === userId ? 'You' : friendName}:</strong> ${data.content}`;
                messages.appendChild(messageElement);
                scrollToBottom();

                // Update last message content in friends list
                document.querySelectorAll('#friends-list li').forEach(item => {
                    if (item.getAttribute('data-id') === data.senderId) {
                        const lastMessageSpan = item.querySelector('.last-message');
                        lastMessageSpan.textContent = data.content;
                    }
                });
            });

            function updateTypingStatus(isTyping) {
                typingStatus.textContent = isTyping ? `${friendName} is typing...` : '';
            }

            socket.on('userTyping', (data) => {
                if (data.userId === friendId) updateTypingStatus(true);
            });

            socket.on('userStoppedTyping', (data) => {
                if (data.userId === friendId) updateTypingStatus(false);
            });

            let typingTimeout;
            messageInput.addEventListener('input', () => {
                clearTimeout(typingTimeout);
                socket.emit('typing', { userId, friendId });
                typingTimeout = setTimeout(() => {
                    socket.emit('stopTyping', { userId, friendId });
                }, 3000);
            });

            document.querySelectorAll('#friends-list li').forEach(item => {
                item.addEventListener('click', () => {
                    const newFriendId = item.getAttribute('data-id');
                    if (newFriendId !== friendId) {
                        window.location.href = `/chat/${newFriendId}`;
                    }
                });
            });
        });
