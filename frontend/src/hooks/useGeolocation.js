import { useState } from 'react';

export const useGeolocation = () => {
  // State to hold all our location info
  const [locationData, setLocationData] = useState({
    coords: null,
    cityName: null,
    error: null,
  });

  const getLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          
          try {
            // Fetch the readable city name using OpenStreetMap
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
            const data = await response.json();
            
            // Extract the city/town name
            const city = data.address.city || data.address.town || data.address.village || data.address.county;
            
            // Update state with everything
            setLocationData({ coords: { lat, lng }, cityName: city, error: null });
            console.log("Location grabbed:", lat, lng, "City:", city);
            
          } catch (err) {
            console.error("Failed to convert coordinates to city:", err);
            setLocationData({ coords: { lat, lng }, cityName: null, error: "Failed to fetch city name" });
          }
        },
        (err) => {
          console.error("Error getting location:", err.message);
          setLocationData(prev => ({ ...prev, error: err.message }));
        }
      );
    } else {
      setLocationData(prev => ({ ...prev, error: "Geolocation is not supported by this browser." }));
    }
  };

  // Return the data and the function so other files can use them
  return { ...locationData, getLocation };
};