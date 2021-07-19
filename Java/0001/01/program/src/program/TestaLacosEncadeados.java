package program;

public class TestaLacosEncadeados {
	public static void main(String[] args) {
		for(int multi = 1; multi <= 10; multi++) {
			for(int contador = 0; contador <= 10; contador++) {
				System.out.print(multi * contador);
				System.out.print(" ");
			}
			System.out.println();
		}
	}
}
