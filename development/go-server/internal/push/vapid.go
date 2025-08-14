package push

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"os"
	"path/filepath"
)

// VAPIDKeys holds the public and private keys for VAPID authentication
type VAPIDKeys struct {
	PublicKey  string `json:"publicKey"`
	PrivateKey string `json:"privateKey"`
}

// VAPIDKeyManager handles VAPID key generation, storage, and retrieval
type VAPIDKeyManager struct {
	keyPath string
}

// NewVAPIDKeyManager creates a new VAPID key manager
func NewVAPIDKeyManager(keyPath string) *VAPIDKeyManager {
	return &VAPIDKeyManager{
		keyPath: keyPath,
	}
}

// GenerateKeys generates a new VAPID key pair
func (v *VAPIDKeyManager) GenerateKeys() (*VAPIDKeys, error) {
	// Generate ECDSA private key using P-256 curve (required for VAPID)
	privateKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, fmt.Errorf("failed to generate private key: %w", err)
	}

	// Convert private key to PKCS#8 format
	privateKeyBytes, err := x509.MarshalPKCS8PrivateKey(privateKey)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal private key: %w", err)
	}

	// Convert public key to uncompressed format (required for VAPID)
	publicKeyBytes := elliptic.Marshal(elliptic.P256(), privateKey.PublicKey.X, privateKey.PublicKey.Y)

	// Base64 URL encode the keys
	publicKeyB64 := base64.RawURLEncoding.EncodeToString(publicKeyBytes)
	privateKeyB64 := base64.RawURLEncoding.EncodeToString(privateKeyBytes)

	return &VAPIDKeys{
		PublicKey:  publicKeyB64,
		PrivateKey: privateKeyB64,
	}, nil
}

// LoadKeys loads VAPID keys from the configured path
func (v *VAPIDKeyManager) LoadKeys() (*VAPIDKeys, error) {
	publicKeyPath := filepath.Join(v.keyPath, "vapid_public.key")
	privateKeyPath := filepath.Join(v.keyPath, "vapid_private.key")

	// Check if both key files exist
	if _, err := os.Stat(publicKeyPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("public key file not found: %s", publicKeyPath)
	}
	if _, err := os.Stat(privateKeyPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("private key file not found: %s", privateKeyPath)
	}

	// Read public key
	publicKeyBytes, err := os.ReadFile(publicKeyPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read public key: %w", err)
	}

	// Read private key
	privateKeyBytes, err := os.ReadFile(privateKeyPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read private key: %w", err)
	}

	return &VAPIDKeys{
		PublicKey:  string(publicKeyBytes),
		PrivateKey: string(privateKeyBytes),
	}, nil
}

// SaveKeys saves VAPID keys to the configured path
func (v *VAPIDKeyManager) SaveKeys(keys *VAPIDKeys) error {
	// Ensure directory exists
	if err := os.MkdirAll(v.keyPath, 0700); err != nil {
		return fmt.Errorf("failed to create key directory: %w", err)
	}

	publicKeyPath := filepath.Join(v.keyPath, "vapid_public.key")
	privateKeyPath := filepath.Join(v.keyPath, "vapid_private.key")

	// Save public key
	if err := os.WriteFile(publicKeyPath, []byte(keys.PublicKey), 0600); err != nil {
		return fmt.Errorf("failed to save public key: %w", err)
	}

	// Save private key
	if err := os.WriteFile(privateKeyPath, []byte(keys.PrivateKey), 0600); err != nil {
		return fmt.Errorf("failed to save private key: %w", err)
	}

	return nil
}

// GetOrGenerateKeys loads existing keys or generates new ones if they don't exist
func (v *VAPIDKeyManager) GetOrGenerateKeys() (*VAPIDKeys, error) {
	// Try to load existing keys first
	keys, err := v.LoadKeys()
	if err == nil {
		return keys, nil
	}

	// If loading failed, generate new keys
	keys, err = v.GenerateKeys()
	if err != nil {
		return nil, fmt.Errorf("failed to generate VAPID keys: %w", err)
	}

	// Save the generated keys
	if err := v.SaveKeys(keys); err != nil {
		return nil, fmt.Errorf("failed to save VAPID keys: %w", err)
	}

	return keys, nil
}

// ValidateKeys validates that the VAPID keys are properly formatted
func (v *VAPIDKeyManager) ValidateKeys(keys *VAPIDKeys) error {
	if keys.PublicKey == "" {
		return fmt.Errorf("public key is empty")
	}
	if keys.PrivateKey == "" {
		return fmt.Errorf("private key is empty")
	}

	// Validate public key format
	publicKeyBytes, err := base64.RawURLEncoding.DecodeString(keys.PublicKey)
	if err != nil {
		return fmt.Errorf("invalid public key format: %w", err)
	}
	if len(publicKeyBytes) != 65 { // Uncompressed P-256 public key should be 65 bytes
		return fmt.Errorf("invalid public key length: expected 65 bytes, got %d", len(publicKeyBytes))
	}

	// Validate private key format
	privateKeyBytes, err := base64.RawURLEncoding.DecodeString(keys.PrivateKey)
	if err != nil {
		return fmt.Errorf("invalid private key format: %w", err)
	}

	// Try to parse the private key
	_, err = x509.ParsePKCS8PrivateKey(privateKeyBytes)
	if err != nil {
		return fmt.Errorf("invalid private key: %w", err)
	}

	return nil
}

// ExportKeysToPEM exports the VAPID keys to PEM format for external tools
func (v *VAPIDKeyManager) ExportKeysToPEM(keys *VAPIDKeys) (publicPEM, privatePEM string, err error) {
	// Decode the base64 keys
	publicKeyBytes, err := base64.RawURLEncoding.DecodeString(keys.PublicKey)
	if err != nil {
		return "", "", fmt.Errorf("failed to decode public key: %w", err)
	}

	privateKeyBytes, err := base64.RawURLEncoding.DecodeString(keys.PrivateKey)
	if err != nil {
		return "", "", fmt.Errorf("failed to decode private key: %w", err)
	}

	// Create PEM blocks
	publicPEMBlock := &pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: publicKeyBytes,
	}

	privatePEMBlock := &pem.Block{
		Type:  "PRIVATE KEY",
		Bytes: privateKeyBytes,
	}

	// Encode to PEM
	publicPEM = string(pem.EncodeToMemory(publicPEMBlock))
	privatePEM = string(pem.EncodeToMemory(privatePEMBlock))

	return publicPEM, privatePEM, nil
}

// GetPublicKeyForFrontend returns the public key in a format suitable for the frontend
func (v *VAPIDKeyManager) GetPublicKeyForFrontend(keys *VAPIDKeys) string {
	return keys.PublicKey
}