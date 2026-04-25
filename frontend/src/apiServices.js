export const createNewRestaurantAPI = async (restaurantData) => {
  try {
    const response = await fetch("http://localhost:8000/api/restaurants/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: restaurantData.name,
        food_type: restaurantData.food_type,
        google_place_id: restaurantData.google_place_id,
        google_formatted_address: restaurantData.google_formatted_address,
        google_lat: restaurantData.google_lat,
        google_lng: restaurantData.google_lng,
        google_website: restaurantData.google_website,
        google_phone: restaurantData.google_phone,
        google_price_tier: restaurantData.google_price_tier,
        opening_hours: restaurantData.opening_hours,
      }),
    });
    return await response.json();
  } catch (error) {
    console.error("API Error creating restaurant:", error);
    return null;
  }
};