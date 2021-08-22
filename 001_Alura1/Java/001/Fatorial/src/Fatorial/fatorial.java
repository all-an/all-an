package Fatorial;

public class fatorial {
	public static void main(String[] args) {
		int i, fatorial = 1;
		for(i = 1; i <= 10; i++) {
			fatorial *= i;
			System.out.println("O fatorial de " + i + " é: " + fatorial);
		}
	}	
}
