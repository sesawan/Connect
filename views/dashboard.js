<!-- Load jQuery -->
<script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>

<script>
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

    // Notifications Dropdown
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
                                        <button class="action-button" data-id="${request.id}" data-action="accept">Accept</button>
                                        <button class="action-button" data-id="${request.id}" data-action="decline">Decline</button>
                                    </div>
                                </div>
                            </div>
                        `);
                    });
                }
            },
            error: handleAjaxError
        });
    }

    function handleAjaxError(xhr) {
        alert('An error occurred: ' + xhr.responseText);
    }

    function handleNotifications() {
        $('#notifications-button').click(function () {
            $('#notifications-dropdown').toggleClass('show');
        });

        $(document).on('click', '.action-button', function () {
            const requestId = $(this).data('id');
            const action = $(this).data('action');
            const url = action === 'accept' ? '/accept-friend-request' : '/decline-friend-request';

            $.post(url, { requestId: requestId })
                .done(function () {
                    alert(`Friend request ${action}ed`);
                    fetchNotifications();
                })
                .fail(handleAjaxError);
        });

        $(document).click(function (e) {
            if (!$(e.target).closest('.user-profile, .user-dropdown, #notifications-button').length) {
                $('.user-dropdown').removeClass('show');
                $('#notifications-dropdown').removeClass('show');
            }
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

    // Friend List and Chat
    function handleFriendList() {
        document.getElementById('chat-icon').addEventListener('click', function(event) {
            event.stopPropagation();
            const friendListContainer = document.getElementById('friend-list-container');
            friendListContainer.style.display = friendListContainer.style.display === 'none' ? 'block' : 'none';
        });

        document.querySelectorAll('.friend-item').forEach(item => {
            item.addEventListener('click', function() {
                const friendId = this.dataset.friendId;
                window.location.href = `/chat/${friendId}`;
            });
        });

        document.addEventListener('click', function(event) {
            const friendListContainer = document.getElementById('friend-list-container');
            const chatIcon = document.getElementById('chat-icon');

            if (!friendListContainer.contains(event.target) && event.target !== chatIcon) {
                friendListContainer.style.display = 'none';
            }
        });
    }

    // Image Upload and Preview
    function handleImageUpload() {
        const imageInput = document.getElementById('image-input');
        const imagePreview = document.getElementById('image-preview');

        imageInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function (e) {
                    imagePreview.src = e.target.result;
                    imagePreview.style.display = 'block';
                }
                reader.readAsDataURL(file);
            } else {
                imagePreview.src = '#';
                imagePreview.style.display = 'none';
            }
        });
    }

    // Initialize all functionalities
    function init() {
        handleLikeButtonClick();
        handleUserProfile();
        handleNotifications();
        handleComments();
        handleFriendList();
        handleImageUpload();
        fetchNotifications();
    }

    init();
});
</script>

