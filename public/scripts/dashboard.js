

$(document).ready(function () {
    // Like/Unlike Button Functionality
    function handleLikeButtonClick() {
        $('.like-button').click(function () {
            const postId = $(this).data('post-id');
            const likeCountSpan = $(this).find('.like-count');
            const button = $(this);

            $.ajax({
                url: '/like-post',
                method: 'POST',
                data: { post_id: postId },
                success: function (data) {
                    if (data.success) {
                        likeCountSpan.text(data.like_count);
                        button.html(`
                            <i class="fas fa-thumbs-up like-icon"></i>
                            <span class="like-count">${data.like_count}</span> ${data.action === 'like' ? 'Like' : 'Unlike'}
                        `);
                    } else {
                        alert(data.message);
                    }
                },
                error: function (xhr) {
                    alert('An error occurred: ' + xhr.responseText);
                }
            });
        });
    }

    // User Profile Dropdown and Logout
    function handleUserProfile() {
        const userId = $('#user-profile-img').data('user-id');

        $('.user-profile img').click(function () {
            $('.user-dropdown').toggleClass('show');
        });

        $('#logout-link').click(function (e) {
            e.preventDefault();
            $.get('/logout', function () {
                window.location.href = '/';
            }).fail(handleAjaxError);
        });

        $('#profile-link').click(function (e) {
            e.preventDefault();
            window.location.href = `/profile/${userId}`;
        });
    }
    
    // Comment Handling
    function handleComments() {
        document.querySelectorAll('.card-text').forEach(postText => {
            const textLength = postText.innerText.length;
            postText.classList.add(textLength > 200 ? 'long-content' : 'short-content');
        });

        document.querySelectorAll('.comment-form').forEach(form => {
            form.addEventListener('submit', function(e) {
                e.preventDefault();

                const formData = new FormData(this);
                fetch('/create-comment', {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: new URLSearchParams(formData)
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        const commentsSection = this.previousElementSibling;
                        const newComment = document.createElement('div');
                        newComment.className = 'comment mb-2';
                        newComment.innerHTML = `<strong>You:</strong> ${formData.get('content')}<small class="text-muted"> just now</small>`;
                        commentsSection.appendChild(newComment);

                        if (commentsSection.style.display === 'none' || commentsSection.style.display === '') {
                            commentsSection.style.display = 'block';
                            this.previousElementSibling.previousElementSibling.textContent = 'Hide Comments';
                        }

                        this.querySelector('.form-control').value = '';
                    } else {
                        alert(data.message);
                    }
                })
                .catch(error => console.error('Error:', error));
            });
        });

        document.querySelectorAll('.view-comments-btn').forEach(button => {
            button.addEventListener('click', function() {
                const commentsSection = this.nextElementSibling;
                const isHidden = commentsSection.style.display === 'none' || commentsSection.style.display === '';

                commentsSection.style.display = isHidden ? 'block' : 'none';
                this.textContent = isHidden ? 'Hide Comments' : 'View Comments';
            });

            const commentsSection = button.nextElementSibling;
            button.textContent = commentsSection.style.display === 'none' || commentsSection.style.display === '' ? 'View Comments' : 'Hide Comments';
        });
    }

    

    // Initialize all functionalities
    function init() {
        handleLikeButtonClick();
        handleUserProfile();
        handleNotifications();
        handleComments();
        handleImageUpload();
        fetchNotifications();
    }

    init();
});


document.getElementById('media-input').addEventListener('change', function(event) {
  const file = event.target.files[0];
  const mediaPreviewContainer = document.querySelector('.media-preview-container');
  const imagePreview = document.getElementById('image-preview');
  const videoPreview = document.getElementById('video-preview');
  const videoSource = videoPreview.querySelector('source');

  if (file) {
    mediaPreviewContainer.style.display = 'block'; // Show the preview container

    if (file.type.startsWith('image/')) {
      imagePreview.src = URL.createObjectURL(file);
      imagePreview.style.display = 'block';
      videoPreview.style.display = 'none';
    } else if (file.type.startsWith('video/')) {
      videoSource.src = URL.createObjectURL(file);
      videoPreview.load(); // Load the video
      videoPreview.style.display = 'block';
      imagePreview.style.display = 'none';
    }
  } else {
    mediaPreviewContainer.style.display = 'none'; // Hide the preview container if no file is selected
  }
});


        $(document).ready(function () {
            const userId = $('#user-profile-img').data('user-id');

            $('.user-profile img').click(function () {
                $('.user-dropdown').toggleClass('show');
            });

            $('#logout-link').click(function (e) {
                e.preventDefault();
                $.get('/logout', function () {
                    window.location.href = '/';
                }).fail(function () {
                    alert('Failed to log out');
                });
            });

            $('#profile-link').click(function (e) {
                e.preventDefault();
                window.location.href = `/profile/${userId}`;
            });

            function fetchNotifications() {
	    $.ajax({
		url: '/notifications',
		method: 'GET',
		success: function (data) {
		    $('#notifications-dropdown').empty();
		    $('#notifications-badge').text(data.friendRequests.length);

		    if (data.friendRequests.length === 0) {
		        $('#notifications-dropdown').append('<div class="no-notifications">No notifications</div>');
		    } else {
		        data.friendRequests.forEach(function (request) {
		            $('#notifications-dropdown').append(`
		                <div class="notification-card">
		                    <a href="/profile/${request.sender_id}" class="notification-link">
		                        <img src="${request.sender_photo || '/images/default-profile.png'}" alt="${request.sender_name}'s photo" class="user-profile-img">
		                    </a>
		                    <div class="notification-content">
		                        <div class="notification-header">${request.sender_name} sent you a friend request</div>
		                        <div class="notification-actions">
		                            <button class="action-button accept-button" data-id="${request.id}">Accept</button>
		                            <button class="action-button decline-button" data-id="${request.id}">Decline</button>
		                        </div>
		                    </div>
		                </div>
		            `);
		        });
		    }
		},
		error: function () {
		    alert('Failed to load notifications');
		}
	    });
	}



            $('#notifications-button').click(function () {
                $('#notifications-dropdown').toggleClass('show');
            });

            $(document).on('click', '.accept-button', function () {
	    const requestId = $(this).data('id');
	    $.post(`/accept-friend-request`, { requestId: requestId })
		.done(function () {
		    alert('Friend request accepted');
		    fetchNotifications();
		})
		.fail(function (xhr) {
		    alert('Failed to accept friend request: ' + xhr.responseText);
		});
	});

	$(document).on('click', '.decline-button', function () {
	    const requestId = $(this).data('id');
	    $.post(`/decline-friend-request`, { requestId: requestId })
		.done(function () {
		    alert('Friend request declined');
		    fetchNotifications();
		})
		.fail(function (xhr) {
		    alert('Failed to decline friend request: ' + xhr.responseText);
		});
	});


            $(document).click(function (e) {
                if (!$(e.target).closest('.user-profile, .user-dropdown, #notifications-button').length) {
                    $('.user-dropdown').removeClass('show');
                    $('#notifications-dropdown').removeClass('show');
                }
            });

            // Initialize notifications
            fetchNotifications();
        });
    

document.getElementById('post-form').addEventListener('submit', function(e) {
    e.preventDefault(); // Prevent the form from submitting the traditional way

    const formData = new FormData(this);
    const loadingSpinner = document.getElementById('loading-spinner');
    const successMessage = document.getElementById('success-message');
    const imagePreview = document.getElementById('image-preview');
    const videoPreview = document.getElementById('video-preview');
    const progressBar = document.getElementById('progress-bar');
    const progressContainer = document.getElementById('progress-container');

    // Show the progress bar
    progressContainer.style.display = 'block';

    // Use XMLHttpRequest for more control over the upload process
    const xhr = new XMLHttpRequest();

    xhr.open('POST', '/create-post', true);

    xhr.upload.onprogress = function(e) {
        if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100;
            progressBar.style.width = percentComplete + '%';
        }
    };

    xhr.onload = function() {
        // Hide the progress bar after the upload is complete
        progressContainer.style.display = 'none';

        if (xhr.status === 200) {
            const data = JSON.parse(xhr.responseText);

            if (data.success) {
                // Show the success message
                successMessage.style.display = 'block';

                // Clear the form fields after submission
                document.getElementById('post-form').reset();

                // Hide the media previews and reset the video source
                imagePreview.classList.add('d-none');
                videoPreview.classList.add('d-none');
                videoPreview.src = ''; // Clear the video preview source

                // Hide the media preview container
                document.querySelector('.media-preview-container').style.display = 'none';

                // Create the new post element dynamically
                const newPost = document.createElement('div');
                newPost.className = 'card mb-3';
                newPost.innerHTML = `
                    <div class="card-body">
                        <div class="post-header d-flex align-items-center mb-3">
                            <a href="/profile/${data.post.authorId}">
                                <img src="<%= profilePhoto || '/images/default-profile.png' %>" alt="Profile Photo" class="profile-photo-sm mr-3">
                            </a>
                            <h5 class="card-title mb-0">You</h5>
                        </div>
                        <p class="card-text">${data.post.content}</p>
                        ${data.post.image ? `<img src="/uploads/${data.post.image}" alt="Post Image" class="post-image">` : ''}
                        <small class="timestamp">just now</small>
                    </div>
                `;

                // Prepend the new post to the posts container
                document.getElementById('posts').prepend(newPost);

                // Hide the success message after 3 seconds
                setTimeout(() => {
                    successMessage.style.display = 'none';
                }, 3000);
            } else {
                alert(data.message); // Handle errors by showing an alert
            }
        } else {
            alert('An error occurred during the upload. Please try again.');
        }
    };

    xhr.onerror = function() {
        // Hide the progress bar in case of error
        progressContainer.style.display = 'none';
        alert('An error occurred during the upload. Please try again.');
    };

    xhr.send(formData);
});

document.getElementById('media-input').addEventListener('change', function() {
    const file = this.files[0];
    const imagePreview = document.getElementById('image-preview');
    const videoPreview = document.getElementById('video-preview');
    const mediaPreviewContainer = document.querySelector('.media-preview-container');

    if (file) {
        // Show appropriate preview depending on the file type
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                imagePreview.src = e.target.result;
                imagePreview.classList.remove('d-none');
                videoPreview.classList.add('d-none');
                videoPreview.src = ''; // Reset video source
                mediaPreviewContainer.style.display = 'block'; // Show preview container
            };
            reader.readAsDataURL(file);
        } else if (file.type.startsWith('video/')) {
            const videoUrl = URL.createObjectURL(file);
            videoPreview.src = videoUrl;
            videoPreview.classList.remove('d-none');
            imagePreview.classList.add('d-none');
            mediaPreviewContainer.style.display = 'block'; // Show preview container
        }
    } else {
        // Hide both previews if no file is selected
        imagePreview.classList.add('d-none');
        videoPreview.classList.add('d-none');
        videoPreview.src = ''; // Reset video source
        mediaPreviewContainer.style.display = 'none'; // Hide preview container
    }
});



document.getElementById('reelForm').addEventListener('submit', async function (event) {
    event.preventDefault();

    const formData = new FormData(this);

    try {
        const response = await fetch('/create-reel', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            alert('Reel created successfully!');
            window.location.href = '/dashboard'; // Redirect to dashboard or reels page
        } else {
            alert('Failed to create reel: ' + result.message);
        }
    } catch (error) {
        console.error('Error uploading reel:', error);
        alert('An error occurred while creating the reel.');
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const reelsContainer = document.querySelector('.reels-container');
    const hammer = new Hammer(reelsContainer);

    // Swipe left event
    hammer.on('swipeleft', () => {
        // Scroll to the next reel
        reelsContainer.scrollBy({ left: window.innerWidth, behavior: 'smooth' });
    });

    // Swipe right event
    hammer.on('swiperight', () => {
        // Scroll to the previous reel
        reelsContainer.scrollBy({ left: -window.innerWidth, behavior: 'smooth' });
    });

    // Optional: handle full-screen toggle when clicking on a reel
    document.querySelectorAll('.reel').forEach(reel => {
        reel.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                reel.requestFullscreen().catch(err => {
                    console.error("Failed to enter full screen mode:", err);
                });
            } else {
                document.exitFullscreen().catch(err => {
                    console.error("Failed to exit full screen mode:", err);
                });
            }
        });
    });
});


document.addEventListener('DOMContentLoaded', function () {
    const chatHeadAvatar = document.getElementById('chat-head-avatar');
    const chatContainer = document.getElementById('chat-container');
    const closeChat = document.getElementById('close-chat');
    const sendChat = document.getElementById('send-chat');
    const chatInput = document.getElementById('chat-input');
    const chatMessages = document.getElementById('chat-messages');
    const typingIndicator = document.getElementById('typing-indicator');

    // Initial state: chat container is hidden
    chatContainer.style.display = 'none';

    // Toggle chat container visibility when chat head avatar is clicked
    chatHeadAvatar.addEventListener('click', function () {
        chatContainer.style.display = chatContainer.style.display === 'none' ? 'flex' : 'none';
    });

    // Close chat container when close button is clicked
    closeChat.addEventListener('click', function () {
        chatContainer.style.display = 'none';
    });

    // Send message functionality
    sendChat.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') sendMessage();
    });

    function sendMessage() {
        const message = chatInput.value.trim();
        if (message === '') return;

        // Display user's message
        const userMessageElement = document.createElement('div');
        userMessageElement.classList.add('chat-message');
        userMessageElement.innerHTML = `
            <div class="message-content">
                <span class="user">You:</span> ${message}
            </div>`;
        chatMessages.appendChild(userMessageElement);
        chatInput.value = '';

        // Show typing indicator
        typingIndicator.style.display = 'flex';

        // Simulate a delay for AI's response (e.g., 1.5 to 3 seconds)
        setTimeout(() => {
            // Call the API to get the AI's response
            fetch('http://192.168.0.105:5000/chatai', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer 12345678',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message: message })
            })
            .then(response => response.json())
            .then(data => {
                // Hide typing indicator
                typingIndicator.style.display = 'none';

                // Display AI's response
                const aiMessageElement = document.createElement('div');
                aiMessageElement.classList.add('chat-message');
                aiMessageElement.innerHTML = `
                    <div class="message-avatar">
                        <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR7XneMGjOdupGjZFesW1XmNgwrjAnFJXLi2qMMRr6oFsNEhC6IOPhVPgUGJjyq88HU9tI&usqp=CAU" alt="AI Avatar" />
                    </div>
                    <div class="message-content">
                        <span class="ai">AI Girlfriend:</span> ${data.response}
                    </div>`;
                chatMessages.appendChild(aiMessageElement);
                chatMessages.scrollTop = chatMessages.scrollHeight; // Scroll to the bottom
            })
            .catch(error => {
                console.error('Error:', error);
                // Hide typing indicator in case of error
                typingIndicator.style.display = 'none';
            });
        }, getRandomDelay());
    }

    function getRandomDelay() {
        // Generate a random delay between 1.5 to 3 seconds
        return Math.floor(Math.random() * (3000 - 1500 + 1)) + 1500;
    }
});


<!-- JavaScript to handle friend list display and chat selection -->
    document.getElementById('chat-icon').addEventListener('click', function() {
      const friendListContainer = document.getElementById('friend-list-container');
      friendListContainer.style.display = friendListContainer.style.display === 'none' ? 'block' : 'none';
    });

    document.querySelectorAll('.friend-item').forEach(item => {
      item.addEventListener('click', function() {
        const friendId = this.dataset.friendId;
        window.location.href = `/chat/${friendId}`;
      });
    });
 

