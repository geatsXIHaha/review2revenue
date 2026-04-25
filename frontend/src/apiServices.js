// src/apiServices.js

export const createNewRestaurantAPI = async (restaurantData) => {
  try {
    // Make sure this matches your Python backend URL and port
    const response = await fetch("http://localhost:8000/api/restaurants/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(restaurantData),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("API Error creating restaurant:", error);
    return null;
  }
};